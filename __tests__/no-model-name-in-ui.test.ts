// Card c6d6de0e: the text generation is Claude-first with a Gemini fallback (10-14), so the UI must not
// name a model. Scans the app's screens and components (not the tests, not the server functions).
// Neither provider is named: "Claude" would mislead the same way whenever the fallback answers.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!/__tests__|__snapshots__/.test(e)) walk(p, out); }
    else if (/\.tsx?$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}

it('no "Gemini" or "Claude" in the user-facing strings of screens and components', () => {
  const src = join(__dirname, '..', 'src');
  const files = [...walk(join(src, 'screens')), ...walk(join(src, 'components'))];
  const hits: string[] = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\{\/\*.*?\*\/\}/g, '');
      if (/Gemini|Claude/.test(code)) hits.push(`${f.replace(/.*\/src\//, 'src/')}:${i + 1}`);
    });
  }
  expect(hits).toEqual([]);
});
