export function formatCost(tokens: number, perMillionDollars: number) {
  const cost = (tokens / 1_000_000) * perMillionDollars
  if (cost < 0.01) {
    const s = cost.toFixed(4).replace(/0+$/, '0')
    const decimals = s.split('.')[1]?.length ?? 0
    return decimals < 2 ? cost.toFixed(2) : s
  }
  return cost.toFixed(2)
}
