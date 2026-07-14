🧹 Use of any type in BillingContext error catching

🎯 **What:** Replaced the use of `any` types when checking if an error is a RevenueCat purchase cancellation error with a proper TypeScript type guard.
💡 **Why:** This improves the maintainability and type safety of the codebase by removing raw `any` assertions, and leverages an `isPurchasesError` type guard which can be reused.
✅ **Verification:** Ran `tsc --noEmit` and unit tests (`npx jest`) to confirm functionality and types remain sound. Added unit tests for the new `isPurchasesError` function.
✨ **Result:** Improved code health in `BillingContext.tsx` by using a safer runtime check and type guard.
