# 🧹 Extract complex inline logic and large empty states from ActionPlanScreen

## 🎯 What
This PR addresses a code health issue in `src/screens/ActionPlanScreen.tsx` where the main component was overly long and complex. It does this by:
1. Extracting the inline `useMemo` block that calculates `planStats` into a dedicated custom hook `usePlanStats` located in `src/hooks/usePlanStats.ts`.
2. Extracting the large, complex empty state JSX branch (`visiblePlans.length === 0`) into a separate, modular component `ActionPlanEmptyState` located in `src/components/action-plan/ActionPlanEmptyState.tsx`.
3. Updating `ActionPlanScreen.tsx` to utilize these new extractions, removing unused imports (`useMemo`, `logger`).

## 💡 Why
The `ActionPlanScreen` component was growing too large, making it harder to read, maintain, and test. By extracting distinct logical pieces—specifically the data processing (`planStats`) and the conditional UI (the empty state)—we decouple concerns.
- The custom hook makes state calculation more testable and reusable.
- The isolated empty state component makes the main screen's render function much cleaner, improving overall readability and modularity.

## ✅ Verification
- Read the modified and created files explicitly to ensure proper syntax and context.
- Verified TypeScript compilation and syntax via `npm run typecheck`.
- Ran the full test suite (`npm run test`) to ensure regressions were not introduced (tests passed).
- Ensured formatting and clean linting were executed successfully over the modified files.

## ✨ Result
The length and complexity of `ActionPlanScreen.tsx` are significantly reduced. The codebase now contains a modular component (`ActionPlanEmptyState`) and a focused hook (`usePlanStats`), making future updates easier to manage without changing existing functionality.
