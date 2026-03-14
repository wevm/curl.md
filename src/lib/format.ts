export function formatCost(tokens: number, perMillionDollars: number) {
  const cost = (tokens / 1_000_000) * perMillionDollars
  return cost < 0.01 ? cost.toFixed(4).replace(/0+$/, '0') : cost.toFixed(2)
}
