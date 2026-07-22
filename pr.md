🧹 [Code Health] Extract duplicated webhook logic in useHomeData

🎯 **What:**
The `useHomeData` hook had duplicated logic for triggering the N8N search webhook in both the "Pro" and "Free" search code paths of the `handleNewSearch` function. This duplicated code has been extracted into a separate helper function called `triggerSearchWebhook`.

💡 **Why:**
By extracting this logic into a helper function, we improve the readability of `handleNewSearch`, reduce the total lines of code, and make future updates to the webhook structure much easier and less error-prone (since it only needs to be updated in one place now).

✅ **Verification:**
1. Manually verified the file changes using `cat` and file reading tools.
2. The TypeScript build and lint checks succeeded with no new errors (`tsc --noEmit --jsx react-native`).
3. Ran the full Jest test suite (`npx jest`); all 88 tests passed without failure, ensuring the structural change did not introduce any side effects.

✨ **Result:**
The file `src/hooks/useHomeData.ts` is cleaner, shorter, and easier to maintain.
