// Safe request logging for Edge Functions.
//
// Until 2026-09-08 chat-with-gemini logged the whole parsed request body
// (`JSON.stringify(requestData)`), which put the user's chat message and
// business context into the Supabase function logs. Logs are for shape, not
// content: this helper describes the keys and sizes only, never the values.
export function describeRequestData(data: unknown): string {
  if (data === null || data === undefined) return `(${String(data)})`;
  if (Array.isArray(data)) return `array(${data.length})`;
  if (typeof data !== 'object') return `${typeof data}(${String(data).length})`;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) parts.push(`${key}:${String(value)}`);
    else if (Array.isArray(value)) parts.push(`${key}:array(${value.length})`);
    else if (typeof value === 'string') parts.push(`${key}:string(${value.length})`);
    else if (typeof value === 'object') parts.push(`${key}:object(${Object.keys(value as object).length} keys)`);
    else parts.push(`${key}:${typeof value}`);
  }
  return parts.length ? parts.join(', ') : '(empty object)';
}
