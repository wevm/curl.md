import { createEmulator, type Emulator } from 'emulate'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import Stripe from 'stripe'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import * as Constants from '#lib/constants.ts'
import {
  createPaymentElementCustomerSession,
  getDefaultPaymentMethod,
  getSavedPaymentMethodCount,
  listCardPaymentMethods,
  stripeOptions,
} from '#lib/stripe.ts'
import { getAvailablePort } from '#test/utils.ts'

let emulator: Emulator | undefined
let stripe: Stripe | undefined
const server = setupServer()

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' })

  const port = await getAvailablePort()
  emulator = await createEmulator({ port, service: 'stripe' })
  stripe = new Stripe('sk_test_admin', {
    ...stripeOptions(emulator.url),
    httpClient: Stripe.createFetchHttpClient(),
  })

  return async () => {
    server.close()
    await emulator?.close()
  }
})

afterEach(() => {
  emulator?.reset()
  server.resetHandlers()
})

test('stripeOptions connects to emulate stripe', async () => {
  const customer = await stripeClient().customers.create({
    email: 'stripe-options-test@example.com',
    name: 'Stripe Options Test',
  })

  const paymentIntent = await stripeClient().paymentIntents.create({
    amount: 500,
    currency: 'usd',
    customer: customer.id,
  })

  expect(customer.email).toBe('stripe-options-test@example.com')
  expect(paymentIntent.customer).toBe(customer.id)
  expect(paymentIntent.status).toBe('requires_payment_method')
})

test('getDefaultPaymentMethod returns stored default when present', () => {
  const paymentMethods = [cardPaymentMethod('pm_first'), cardPaymentMethod('pm_default')]

  expect(getDefaultPaymentMethod('pm_default', paymentMethods)?.id).toBe('pm_default')
})

test('getDefaultPaymentMethod falls back to first method when stored default is stale', () => {
  const paymentMethods = [cardPaymentMethod('pm_first'), cardPaymentMethod('pm_second')]

  expect(getDefaultPaymentMethod('pm_missing', paymentMethods)?.id).toBe('pm_first')
  expect(getDefaultPaymentMethod(null, [])).toBe(null)
})

test('listCardPaymentMethods filters out non-card methods', async () => {
  // TODO: Switch this to emulate once Stripe payment_methods are supported there.
  server.use(
    http.get('https://api.stripe.com/v1/payment_methods', () =>
      HttpResponse.json({
        data: [
          cardPaymentMethod('pm_card'),
          { id: 'pm_bank', object: 'payment_method', type: 'us_bank_account' },
        ],
        object: 'list',
      }),
    ),
  )

  const paymentMethods = await listCardPaymentMethods(stripeApiClient(), 'cus_test')

  expect(paymentMethods.map((paymentMethod) => paymentMethod.id)).toEqual(['pm_card'])
})

test('listCardPaymentMethods returns empty list for emulate not-found responses', async () => {
  const stripe = {
    paymentMethods: {
      list: vi.fn().mockResolvedValue({
        documentation_url: 'https://emulate.dev/stripe',
        message: 'Not Found',
      }),
    },
  } as unknown as Stripe

  await expect(listCardPaymentMethods(stripe, 'cus_test')).resolves.toEqual([])
})

test('getSavedPaymentMethodCount requests at most one more than the cap', async () => {
  // TODO: Switch this to emulate once Stripe payment_methods are supported there.
  let requestUrl = ''
  server.use(
    http.get('https://api.stripe.com/v1/payment_methods', ({ request }) => {
      requestUrl = request.url
      return HttpResponse.json({
        data: [cardPaymentMethod('pm_one'), cardPaymentMethod('pm_two')],
        object: 'list',
      })
    }),
  )

  const count = await getSavedPaymentMethodCount(stripeApiClient(), 'cus_test')

  expect(count).toBe(2)
  expect(new URL(requestUrl).searchParams.get('customer')).toBe('cus_test')
  expect(new URL(requestUrl).searchParams.get('limit')).toBe(
    String(Constants.maxSavedPaymentMethods + 1),
  )
  expect(new URL(requestUrl).searchParams.get('type')).toBe('card')
})

test('createPaymentElementCustomerSession falls back to legacy features', async () => {
  // TODO: Switch this to emulate once Stripe customer_sessions are supported there.
  const requestBodies: string[] = []
  server.use(
    http.post('https://api.stripe.com/v1/customer_sessions', async ({ request }) => {
      const body = decodeURIComponent(await request.text())
      requestBodies.push(body)

      if (body.includes('payment_method_allow_redisplay_filters'))
        return HttpResponse.json(
          {
            error: {
              message: 'unsupported parameter',
              param:
                'components[payment_element][features][payment_method_allow_redisplay_filters]',
              type: 'invalid_request_error',
            },
          },
          { status: 400 },
        )

      return HttpResponse.json({
        client_secret: '[REDACTED:secret-value]',
        object: 'customer_session',
      })
    }),
  )

  const session = await createPaymentElementCustomerSession(stripeApiClient(), 'cus_test', true)

  expect(session).toMatchObject({ client_secret: '[REDACTED:secret-value]' })
  expect(requestBodies).toHaveLength(2)
  expect(requestBodies[0]).toContain('customer=cus_test')
  expect(requestBodies[0]).toContain('payment_method_allow_redisplay_filters')
  expect(requestBodies[0]).toContain(
    'components[payment_element][features][payment_method_save]=enabled',
  )
  expect(requestBodies[0]).toContain(
    'components[payment_element][features][payment_method_save_usage]=off_session',
  )
  expect(requestBodies[1]).toContain('customer=cus_test')
  expect(requestBodies[1]).not.toContain('payment_method_allow_redisplay_filters')
  expect(requestBodies[1]).toContain(
    'components[payment_element][features][payment_method_save]=enabled',
  )
  expect(requestBodies[1]).toContain(
    'components[payment_element][features][payment_method_save_usage]=off_session',
  )
})

function stripeClient() {
  if (!stripe) throw new Error('Stripe emulator not initialized')
  return stripe
}

function stripeApiClient() {
  return new Stripe('sk_test_admin', {
    ...stripeOptions('https://api.stripe.com'),
    httpClient: Stripe.createFetchHttpClient(),
  })
}

function cardPaymentMethod(id: string) {
  return {
    card: {
      brand: 'visa',
      exp_month: 1,
      exp_year: 2030,
      funding: 'credit',
      last4: '4242',
    },
    id,
    object: 'payment_method',
    type: 'card',
  } as Stripe.PaymentMethod & { card: NonNullable<Stripe.PaymentMethod['card']> }
}
