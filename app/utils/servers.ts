export function formatCores(value: number) {
  return Number(value.toFixed(1))
}

export function formatGigabytes(value: number) {
  return (value / 1024 ** 3).toFixed(1)
}
