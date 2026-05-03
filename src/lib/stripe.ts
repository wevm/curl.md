import Stripe from 'stripe'
import * as Constants from '#lib/constants.ts'

type StripeCardPaymentMethod = Stripe.PaymentMethod & {
  card: NonNullable<Stripe.PaymentMethod['card']>
}

export async function createPaymentElementCustomerSession(
  stripe: Stripe,
  stripeCustomerId: string,
  canSavePaymentMethod: boolean,
) {
  try {
    return await stripe.customerSessions.create({
      components: {
        payment_element: {
          enabled: true,
          features: {
            // Prefer the newer redisplay filter API so Stripe only shows reusable methods here.
            payment_method_allow_redisplay_filters: ['always', 'limited', 'unspecified'] as Array<
              'always' | 'limited' | 'unspecified'
            >,
            payment_method_redisplay: 'enabled' as const,
            payment_method_remove: 'disabled' as const,
            payment_method_save: canSavePaymentMethod
              ? ('enabled' as const)
              : ('disabled' as const),
            ...(canSavePaymentMethod ? { payment_method_save_usage: 'off_session' as const } : {}),
          },
        },
      },
      customer: stripeCustomerId,
    })
  } catch {
    return stripe.customerSessions.create({
      components: {
        payment_element: {
          enabled: true,
          features: {
            // Older Stripe accounts reject redisplay filters, so retry with the legacy shape.
            payment_method_redisplay: 'enabled' as const,
            payment_method_remove: 'disabled' as const,
            payment_method_save: canSavePaymentMethod
              ? ('enabled' as const)
              : ('disabled' as const),
            ...(canSavePaymentMethod ? { payment_method_save_usage: 'off_session' as const } : {}),
          },
        },
      },
      customer: stripeCustomerId,
    })
  }
}

export function getDefaultPaymentMethod(
  defaultPaymentMethodId: string | null,
  paymentMethods: StripeCardPaymentMethod[],
) {
  if (defaultPaymentMethodId) {
    const paymentMethod = paymentMethods.find((pm) => pm.id === defaultPaymentMethodId)
    if (paymentMethod) return paymentMethod
  }

  return paymentMethods[0] ?? null
}

export async function getSavedPaymentMethodCount(stripe: Stripe, stripeCustomerId: string) {
  return (
    await listCardPaymentMethods(stripe, stripeCustomerId, Constants.maxSavedPaymentMethods + 1)
  ).length
}

export function getPaymentIntentSecret(
  paymentIntent: Pick<Stripe.PaymentIntent, 'client_secret' | 'id'>,
  stripeApiUrl: string,
) {
  if (paymentIntent.client_secret) return paymentIntent.client_secret
  if (!paymentIntent.id) return null

  const hostname = new URL(stripeApiUrl).hostname
  if (hostname === 'api.stripe.com' || hostname.endsWith('.stripe.com')) return null

  // emulate omits payment intent client secrets; synthesize the conventional shape for tests.
  return `${paymentIntent.id}_secret_emulate`
}

export function isPaymentIntentClientSecret(secret: string) {
  return /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(secret)
}

export async function listCardPaymentMethods(
  stripe: Stripe,
  stripeCustomerId: string,
  limit?: number,
) {
  const methods = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    ...(limit ? { limit } : {}),
    type: 'card',
  })

  return methods.data.filter((paymentMethod): paymentMethod is StripeCardPaymentMethod =>
    Boolean(paymentMethod.card),
  )
}

export function stripeOptions(apiUrl: string) {
  const url = new URL(apiUrl)
  return {
    apiVersion: Constants.stripeApiVersion as Stripe.LatestApiVersion,
    host: url.hostname,
    port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    protocol: url.protocol.replace(':', '') as 'http' | 'https',
    timeout: 15_000,
  }
}
