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

// The same rule for a single value: report its shape, never its characters.
export function describeText(value: unknown): string {
  if (value === null || value === undefined) return `(${String(value)})`;
  if (typeof value === 'string') return `string(${value.length})`;
  return describeRequestData(value);
}

// For a JSON payload we can afford a little more shape -- its size and its
// top-level keys -- because the keys are our own schema, not user content.
// The values never appear.
export function describeJsonText(text: unknown): string {
  if (typeof text !== 'string') return describeText(text);
  const size = `string(${text.length})`;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return `${size}, keys: ${Object.keys(parsed).join(', ') || '(none)'}`;
    }
    return `${size}, ${Array.isArray(parsed) ? `array(${parsed.length})` : typeof parsed}`;
  } catch {
    return `${size}, not valid JSON`;
  }
}

// A JSON.parse SyntaxError embeds the beginning of the input in its message
// -- measured: `Unexpected token 'A', "A cegem NA"... is not valid JSON` --
// so the message itself is not safe to log. Keep the name and the position.
export function describeParseError(err: unknown): string {
  if (!(err instanceof Error)) return typeof err;
  const position = /position (\d+)/.exec(err.message)?.[1];
  return position ? `${err.name} at position ${position}` : err.name;
}
