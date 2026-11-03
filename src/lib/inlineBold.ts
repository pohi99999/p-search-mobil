// The Copilot's answers carry markdown bold ("**2026. 12. 02.**"), and the chat bubble showed the asterisks
// (#238 live chat test, Marveen 4864). Only bold is handled, as plain text segments: no HTML, no markup parser.

export interface TextSegment {
  text: string;
  bold: boolean;
}

/**
 * Splits a text on "**" pairs into plain and bold segments. A "**" without a closing pair is dropped, so no
 * stray asterisks reach the screen; empty segments are left out.
 */
export function splitBold(text: string): TextSegment[] {
  const parts = text.split('**');
  // An even number of parts means the last "**" has no pair: its text stays plain.
  const unpaired = parts.length % 2 === 0;
  const segments: TextSegment[] = [];
  parts.forEach((part, i) => {
    if (!part) return;
    const bold = i % 2 === 1 && !(unpaired && i === parts.length - 1);
    const last = segments[segments.length - 1];
    if (last && last.bold === bold) last.text += part;
    else segments.push({ text: part, bold });
  });
  return segments;
}
