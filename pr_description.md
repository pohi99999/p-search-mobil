🎯 **What:** Replaced explicit raw Supabase error messages with generic error strings in authentication alerts.

⚠️ **Risk:** Displaying raw error messages during authentication (like signUp or signIn) can expose sensitive information to attackers, such as whether an email address is already registered in the system (e.g., "User already registered"), aiding in user enumeration attacks.

🛡️ **Solution:** Updated the error handling in `signInWithEmail` and `signUpWithEmail` to display safe, generic error messages (`'Hibás e-mail cím vagy jelszó.'` and `'Váratlan hiba történt a regisztráció során.'`). Updated the corresponding test (`src/screens/AuthScreen.test.tsx`) to match the new expected behavior.
