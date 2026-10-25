// Card [G2]: the latest "Hasznos / Nem releváns" answer per match in this app session, shared by every MatchFeedback
// on screen. The home list stays mounted under the detail view, so without this an answer given on one showed the
// old one on the other (Lumen, 4767). Pure module, no React Native import.
type Value = 'useful' | 'not_relevant' | null;

const answers = new Map<string, Value>();
const listeners = new Set<() => void>();

/** The answer given in this session, or undefined when none was given here (then the loaded value applies). */
export function getMatchFeedback(matchId: string): Value | undefined {
  return answers.get(matchId);
}

export function setStoredMatchFeedback(matchId: string, value: Value): void {
  answers.set(matchId, value);
  listeners.forEach((l) => l());
}

export function subscribeMatchFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test hook: a new session. */
export function resetMatchFeedbackStoreForTest(): void {
  answers.clear();
}
