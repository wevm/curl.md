import { pricing } from '#lib/constants.ts'

export function estimateRequests(balanceMills: number) {
  const costPerRequest = pricing.fetchCostMills + pricing.queryBaseCostMills * pricing.queryMarkup
  return Math.floor(balanceMills / costPerRequest).toLocaleString()
}

export function formatMills(mills: number, decimals?: number) {
  const d = decimals ?? (Math.abs(mills) < 10 ? 3 : 2)
  return (Math.abs(mills) / 1000).toFixed(d)
}

export function formatCost(tokens: number, perMillionDollars: number) {
  const cost = (tokens / 1_000_000) * perMillionDollars
  if (cost === 0) return '0.00'
  const decimals = Math.max(2, -Math.floor(Math.log10(cost)) + 1)
  const factor = 10 ** decimals
  return (Math.floor(cost * factor) / factor).toFixed(decimals)
}
