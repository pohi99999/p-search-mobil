1. Add `useProfile` to `useHomeData.ts`.
2. Modify `fetchData` in `useHomeData.ts` to use `profile` from `useProfile()` instead of fetching `business_profiles` manually.
3. Update `useEffect` to depend on `profile` and `profileLoading` so that we wait for the context to load before fetching matches and redirecting.
4. If `profileLoading` is false and `profile` is null, redirect to `Onboarding`.
5. Remove `profile` from `useHomeData` internal state since we get it from context.
6. Verify tests pass.
