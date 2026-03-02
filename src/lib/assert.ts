export function assert<value>(value: value, message: string): asserts value {
  if (!value) throw new Error(message)
}
