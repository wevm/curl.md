export function formatCost(tokens: number, perMillionDollars: number) {
  const cost = (tokens / 1_000_000) * perMillionDollars
  if (cost === 0) return '0.00'
  const decimals = Math.max(2, -Math.floor(Math.log10(cost)) + 1)
  const factor = 10 ** decimals
  return (Math.floor(cost * factor) / factor).toFixed(decimals)
}
