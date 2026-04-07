import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import Stripe from 'stripe'
import { createClient } from '#db/client.ts'
import * as Constants from '#lib/constants.ts'
import * as Cookie from '#lib/cookie.ts'
import {
  getDefaultPaymentMethod,
  getSavedPaymentMethodCount,
  listCardPaymentMethods,
  stripeOptions,
} from '#lib/stripe.ts'

export type PaymentMethod = Pick<Stripe.PaymentMethod, 'id'> &
  Pick<
    NonNullable<Stripe.PaymentMethod['card']>,
    'brand' | 'exp_month' | 'exp_year' | 'funding' | 'last4'
  > & { is_default: boolean }

export const getBillingData = createServerFn({ method: 'GET' })
  .inputValidator((d: { entityId: string; entityType: 'account' | 'organization' }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const accountId = await resolveAccountId(request, db)
    if (!accountId)
      return {
        balance_mills: 0,
        payment_methods: [] as PaymentMethod[],
        timezone: undefined as string | undefined,
      }

    const table = c.data.entityType === 'organization' ? 'organization' : 'account'
    const billing = await db
      .selectFrom(table)
      .where('id', '=', c.data.entityId)
      .select(['balance_mills', 'default_payment_method_id', 'stripe_customer_id'])
      .executeTakeFirst()

    let paymentMethods: PaymentMethod[] = []
    if (billing?.stripe_customer_id) {
      const stripe = createStripe()
      const methods = await listCardPaymentMethods(stripe, billing.stripe_customer_id)
      const defaultPaymentMethod = getDefaultPaymentMethod(
        billing.default_payment_method_id,
        methods,
      )
      if (defaultPaymentMethod?.id !== billing.default_payment_method_id)
        await db
          .updateTable(table)
          .set({ default_payment_method_id: defaultPaymentMethod?.id ?? null })
          .where('id', '=', c.data.entityId)
          .execute()
      paymentMethods = methods.map((pm) => ({
        brand: pm.card.brand,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
        funding: pm.card.funding,
        id: pm.id,
        is_default: pm.id === defaultPaymentMethod?.id,
        last4: pm.card.last4,
      }))
    }

    return {
      balance_mills: billing?.balance_mills ?? 0,
      payment_methods: paymentMethods,
      timezone: (request as { cf?: { timezone?: string } }).cf?.timezone,
    }
  })

export const getTransactions = createServerFn({ method: 'GET' })
  .inputValidator(
    (d: {
      entityId: string
      entityType: 'account' | 'organization'
      limit: number
      offset: number
    }) => d,
  )
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const accountId = await resolveAccountId(request, db)
    if (!accountId)
      return {
        prior_sum: 0,
        total: 0,
        transactions: [] as { amount_mills: number; created_at: Date; type: string }[],
      }

    const col = c.data.entityType === 'organization' ? 'organization_id' : 'account_id'

    const [countResult, transactions, priorResult] = await Promise.all([
      db
        .selectFrom('credit_transaction')
        .where(col, '=', c.data.entityId)
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('credit_transaction')
        .where(col, '=', c.data.entityId)
        .orderBy('created_at', 'desc')
        .offset(c.data.offset)
        .limit(c.data.limit)
        .select(['amount_mills', 'created_at', 'type'])
        .execute(),
      c.data.offset > 0
        ? db
            .selectFrom(
              db
                .selectFrom('credit_transaction')
                .where(col, '=', c.data.entityId)
                .orderBy('created_at', 'desc')
                .limit(c.data.offset)
                .select('amount_mills')
                .as('prior'),
            )
            .select((eb) => eb.fn.sum<number>('amount_mills').as('sum'))
            .executeTakeFirst()
        : null,
    ])

    return {
      prior_sum: Number(priorResult?.sum ?? 0),
      total: Number(countResult.total),
      transactions,
    }
  })

export const getPayment = createServerFn({ method: 'GET' })
  .inputValidator((d: { id: string }) => d)
  .handler(async (c) => {
    const data = await env.KV.get(`payment:${c.data.id}`, 'json')
    if (!data) return null
    return { ...data, publishable_key: env.STRIPE_PUBLISHABLE_KEY }
  })

const allowedPaymentAmounts = new Set(Constants.creditAmounts.map(Number))

export const changePaymentAmount = createServerFn({ method: 'POST' })
  .inputValidator((d: { amount: number; id: string }) => d)
  .handler(async (c) => {
    if (!allowedPaymentAmounts.has(c.data.amount)) throw new Error('invalid_amount')

    const data = await env.KV.get(`payment:${c.data.id}`, 'json')
    if (!data || data.locked) throw new Error('not_found')

    const piId = data.pi_secret.slice(0, data.pi_secret.indexOf('_secret_'))
    await createStripe().paymentIntents.update(piId, { amount: c.data.amount })
    await env.KV.put(`payment:${c.data.id}`, JSON.stringify({ ...data, amount: c.data.amount }), {
      expirationTtl: 1800,
    })
  })

export const deletePayment = createServerFn({ method: 'POST' })
  .inputValidator((d: { id: string }) => d)
  .handler(async (c) => {
    await env.KV.delete(`payment:${c.data.id}`)
  })

export const setupPaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator((d: { entityId: string; entityType: 'account' | 'organization' }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const accountId = await resolveAccountId(request, db)
    if (!accountId) throw new Error('Authentication required')

    const table = c.data.entityType === 'organization' ? 'organization' : 'account'
    if (c.data.entityType === 'organization') {
      await requireOrgAdmin(db, c.data.entityId, accountId)
    }

    const billing = await db
      .selectFrom(table)
      .where('id', '=', c.data.entityId)
      .select('stripe_customer_id')
      .executeTakeFirst()
    if (!billing) throw new Error('Not found')

    const stripe = createStripe()
    let stripeCustomerId = billing.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { entity_type: c.data.entityType, entity_id: c.data.entityId },
      })
      const result = await db
        .updateTable(table)
        .set({ stripe_customer_id: customer.id })
        .where('id', '=', c.data.entityId)
        .where('stripe_customer_id', 'is', null)
        .returning('stripe_customer_id')
        .executeTakeFirst()
      if (result?.stripe_customer_id) {
        stripeCustomerId = result.stripe_customer_id
      } else {
        const existing = await db
          .selectFrom(table)
          .where('id', '=', c.data.entityId)
          .select('stripe_customer_id')
          .executeTakeFirstOrThrow()
        stripeCustomerId = existing.stripe_customer_id
        await stripe.customers.del(customer.id)
      }
    }

    if (!stripeCustomerId) throw new Error('Not found')
    if (
      (await getSavedPaymentMethodCount(stripe, stripeCustomerId)) >=
      Constants.maxSavedPaymentMethods
    )
      throw new Error(`Maximum ${Constants.maxSavedPaymentMethods} payment methods allowed.`)

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
    })

    return {
      client_secret: setupIntent.client_secret!,
      publishable_key: env.STRIPE_PUBLISHABLE_KEY,
    }
  })

export const setDefaultPaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { entityId: string; entityType: 'account' | 'organization'; paymentMethodId: string }) => d,
  )
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const accountId = await resolveAccountId(request, db)
    if (!accountId) throw new Error('Authentication required')

    const table = c.data.entityType === 'organization' ? 'organization' : 'account'
    if (c.data.entityType === 'organization') {
      await requireOrgAdmin(db, c.data.entityId, accountId)
    }

    const billing = await db
      .selectFrom(table)
      .where('id', '=', c.data.entityId)
      .select('stripe_customer_id')
      .executeTakeFirst()
    if (!billing?.stripe_customer_id) throw new Error('Not found')

    const methods = await listCardPaymentMethods(createStripe(), billing.stripe_customer_id)
    if (!methods.some((paymentMethod) => paymentMethod.id === c.data.paymentMethodId))
      throw new Error('Not found')

    await db
      .updateTable(table)
      .set({ default_payment_method_id: c.data.paymentMethodId })
      .where('id', '=', c.data.entityId)
      .execute()
  })

export const removePaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { entityId: string; entityType: 'account' | 'organization'; paymentMethodId: string }) => d,
  )
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const accountId = await resolveAccountId(request, db)
    if (!accountId) throw new Error('Authentication required')

    const table = c.data.entityType === 'organization' ? 'organization' : 'account'
    if (c.data.entityType === 'organization') {
      await requireOrgAdmin(db, c.data.entityId, accountId)
    }

    const billing = await db
      .selectFrom(table)
      .where('id', '=', c.data.entityId)
      .select(['default_payment_method_id', 'stripe_customer_id'])
      .executeTakeFirst()
    if (!billing?.stripe_customer_id) throw new Error('Not found')

    const stripe = createStripe()

    const methods = await listCardPaymentMethods(stripe, billing.stripe_customer_id)
    if (!methods.some((paymentMethod) => paymentMethod.id === c.data.paymentMethodId))
      throw new Error('Not found')

    await stripe.paymentMethods.detach(c.data.paymentMethodId)

    const remainingMethods = await listCardPaymentMethods(stripe, billing.stripe_customer_id)
    const defaultPaymentMethod = getDefaultPaymentMethod(
      billing.default_payment_method_id === c.data.paymentMethodId
        ? null
        : billing.default_payment_method_id,
      remainingMethods,
    )
    if (defaultPaymentMethod?.id !== billing.default_payment_method_id)
      await db
        .updateTable(table)
        .set({ default_payment_method_id: defaultPaymentMethod?.id ?? null })
        .where('id', '=', c.data.entityId)
        .execute()
  })

async function resolveAccountId(request: Request, db: ReturnType<typeof createClient>) {
  const sessionId = await Cookie.parseSigned(
    request.headers.get('cookie') ?? '',
    env.COOKIE_SECRET,
    'curl.session',
  )
  if (!sessionId) return null
  const session = await db
    .selectFrom('session')
    .where('id', '=', sessionId)
    .where('expires_at', '>', new Date())
    .select('account_id')
    .executeTakeFirst()
  return session?.account_id ?? null
}

async function requireOrgAdmin(
  db: ReturnType<typeof createClient>,
  organizationId: string,
  accountId: string,
) {
  const member = await db
    .selectFrom('organization_member')
    .where('organization_id', '=', organizationId)
    .where('account_id', '=', accountId)
    .select('role')
    .executeTakeFirst()
  if (!member || (member.role !== 'owner' && member.role !== 'admin'))
    throw new Error('Insufficient permissions')
}

function createStripe() {
  return new Stripe(env.STRIPE_SECRET_KEY, stripeOptions(env.STRIPE_API_URL))
}
