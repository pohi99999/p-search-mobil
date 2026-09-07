🎯 **What:** The vulnerability fixed
The chat history for the Copilot AI assistant was previously being stored unencrypted using `AsyncStorage`. This PR replaces `AsyncStorage` with `expo-secure-store` on native platforms for encrypted persistence, keeping `AsyncStorage` on the web where SecureStore is not supported. Tests were also updated.

⚠️ **Risk:** The potential impact if left unfixed
Unencrypted chat history stored in AsyncStorage is highly vulnerable to extraction on compromised (rooted/jailbroken) devices or via physical access with debugging tools. Since the chat contains sensitive business, grant, or personal AI interactions, this poses a data leak risk for users.

🛡️ **Solution:** How the fix addresses the vulnerability
Introduced two platform-aware helpers (`getSecureItemAsync` and `setSecureItemAsync`) which use `expo-secure-store` for native devices, guaranteeing encryption via Keychain/Keystore. Web platforms fallback to `AsyncStorage`. All `AsyncStorage.getItem` and `AsyncStorage.setItem` calls in `CopilotChatScreen.tsx` have been migrated to these secure wrappers.
