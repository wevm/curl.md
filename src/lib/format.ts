import { pricing } from '#lib/constants.ts'

export function estimateCost(tokens: number, perMillionDollars: number) {
  return (tokens / 1_000_000) * perMillionDollars
}

export function estimateRequests(balanceMills: number) {
  const costPerRequest = pricing.fetchCostMills
  return Math.floor(balanceMills / costPerRequest).toLocaleString()
}

export function formatMills(mills: number, decimals?: number) {
  const d = decimals ?? (Math.abs(mills) % 10 === 0 ? 2 : 3)
  return (Math.abs(mills) / 1000).toFixed(d)
}

export function formatDollars(dollars: number) {
  const sign = dollars < 0 ? '-' : ''
  const amount = Math.abs(dollars)

  if (amount >= 0.01) return `${sign}${amount.toFixed(2)}`
  if (amount >= 0.001) return `${sign}${amount.toFixed(3)}`
  if (amount === 0) return '0.00'
  return `${sign}${amount.toFixed(4)}`
}

export function formatCost(tokens: number, perMillionDollars: number) {
  const cost = estimateCost(tokens, perMillionDollars)
  if (cost >= 0.01) return cost.toFixed(2)
  if (cost === 0) return '0.0'
  const decimals = Math.min(4, Math.max(2, -Math.floor(Math.log10(cost)) + 1))
  const factor = 10 ** decimals
  return (Math.floor(cost * factor) / factor).toFixed(decimals)
}
