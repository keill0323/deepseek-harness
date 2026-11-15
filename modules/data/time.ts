/**
 * Recognize the canonical UTC timestamp carried by one analysis batch.
 * @param value - Untrusted metadata, including missing values from older reports.
 * @returns Whether the value is a real ISO calendar instant with millisecond precision.
 */
export function is_generated_at(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === value
}
