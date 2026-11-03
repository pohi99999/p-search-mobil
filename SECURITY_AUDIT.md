# Security audit — p-search-mobil

- **Date:** 2026-10-16
- **Scope:** default branch `master` at `9c4ae5d`, the full git history (118 commits, all refs), and `npm audit` against `package-lock.json`.
- **Covered:** Supabase RLS and grants (`supabase/migrations/*`, `supabase-schema.sql`); all 13 edge functions and `_shared/`; secrets in the tree and in history; client-side exposure (`EXPO_PUBLIC_*`, `app.json`, `eas.json`, `public/*.html`); webhook authentication (RevenueCat, n8n in and out, pg_cron); deep links; personal data in the repo.
- **Method:** static review only. No live endpoint, database or dashboard was called. The live database can differ from the migrations (for example, policies created in the dashboard), so the RLS conclusions apply to the schema as committed.
- **Secrets** are named by variable and location only. This report contains no secret values.

## Summary

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| H1 | High | Paid AI endpoints (`chat-with-gemini`, `process-master-document`) are open to every free account, with no input-size cap and no per-user rate limit or cost cap | **Partially fixed in this PR** (size caps). Per-user cap: recommendation |
| M1 | Medium | `profiles` INSERT is not limited by column, so a user whose profile row is missing can insert it with `subscription_tier = 'pro'` | Recommendation (needs a migration) |
| M2 | Medium | The hourly `scheduled-grant-scan` can be used to multiply AI cost: `next_scan_at` is user-writable and a user can have any number of business profiles | Recommendation |
| M3 | Medium | `generate-action-plan` accepts any number of `match_ids` and any size of `chat_history`, so one request runs N parallel LLM calls | Recommendation |
| M4 | Medium | Raw OCR output and extracted company financials are written to function logs, and a fragment is returned in an error message | Recommendation |
| M5 | Medium | `reset-password.html` loads supabase-js from a CDN by floating major version, with no SRI and no CSP, on a page that holds a recovery session | Recommendation |
| M6 | Medium | `npm audit` reports 2 critical, 55 high and 13 moderate advisories, all in build and test tooling | Recommendation |
| L1 | Low | CORS falls back to `*` in 6 functions when `ALLOWED_ORIGIN` is unset | Recommendation |
| L2 | Low | Internal error messages and a `debug` object are returned to clients | Recommendation |
| L3 | Low | `chat-with-gemini` reads `grant_matches` by `match_id` with the service-role client and does not check ownership | Recommendation |
| L4 | Low | LLM output drives database writes, so prompt injection can change the caller's own profile and tasks | Recommendation |
| L5 | Low | The outbound n8n webhook call has no authentication and relies only on the URL being secret | Recommendation |
| L6 | Low | `scripts/deploy-n8n-workflow.js` uses the public anon key as the n8n secret when `N8N_WEBHOOK_SECRET` is unset | Recommendation |
| L7 | Low | The Gemini API key is sent as a URL query parameter | Recommendation |
| L8 | Low | `ingest-n8n-grants` has no size or paragraph cap, so one request can trigger any number of embedding calls | Recommendation |
| L9 | Low | The RevenueCat webhook does not tell sandbox events from production events | Recommendation only (payments: not modified) |
| I1 | Info | The owner's personal e-mail is in `src/lib/supabase.mock.ts` and can end up in the app bundle | Recommendation |

There are no Critical findings.

---

## H1 — Paid AI endpoints: no input-size cap, no per-user rate or cost cap (High)

**Where**
- `supabase/functions/chat-with-gemini/index.ts`. Before this PR, the message and history were taken from the body without any size check (now `:80`). Every call makes one Gemini embedding call and one Claude call with Gemini as the fallback (`:374`). There is no Pro gate and no counter.
- `supabase/functions/process-master-document/index.ts`. `file_base64` of any size went straight to the Claude / Gemini vision call (`extractJson`). The size check is now at `:166`. There is no Pro gate and no counter.
- Both functions only require a valid user JWT, and anyone can get one by signing up for free.

**Exploit scenario.** An attacker registers a free account and loops `POST /functions/v1/chat-with-gemini`. Before this PR, each request could carry a message and 10 history turns of several MB each. That means millions of input tokens per call, billed to the project's Anthropic and Google keys. The same loop against `process-master-document` with large PDFs costs even more per call. Several accounts multiply the cost, and nothing server-side stops it before the provider quota or the bill does. A history item without `id` also crashed the function (`msg.id.startsWith` on `undefined`), which returned a 500.

**Fix in this PR** (small, no behaviour change for the app):
- New `supabase/functions/_shared/input-limits.ts`, tested in `input-limits.test.ts`. CI already runs `deno test supabase/functions/_shared/`.
  - Chat: the message is at most 2,000 characters (the app's input allows 500), otherwise 413. At most the last 10 history turns are kept, as before. Each turn is cut to 4,000 characters, and malformed turns are dropped instead of crashing the function.
  - OCR: `file_base64` must be a string of at most about 13.98 M characters (a 10 MB file), otherwise 413. The check runs before the ownership lookup and before any AI call.
- This bounds the cost of a **single** call. It does not limit the **number** of calls.

**Remaining recommendation** (needs a migration, so it is not done here):
1. Add a per-user daily AI counter, following the pattern of `consume_daily_search`: a `SECURITY DEFINER` RPC, `EXECUTE` granted to `service_role` only, with an atomic check-and-increment. For example `consume_ai_call(p_user uuid, p_kind text, p_cap int)`. Call it in `chat-with-gemini` and `process-master-document` before the AI call, with a free cap (for example 30 chats and 5 OCR runs a day) and a higher cap for Pro users.
2. Set hard spend limits and alerts on the Anthropic and Google AI projects. This is the only control that also covers many throwaway accounts.
3. Decide (product decision) whether OCR should be Pro-only like `generate-document` and `generate-action-plan`.

---

## M1 — `profiles` INSERT not limited by column: a user can grant themselves Pro (Medium)

**Where**
- `supabase/migrations/20260822090000_security_and_performance_hardening.sql:20` has the policy `"Users can insert their own profile."` with `WITH CHECK ((select auth.uid()) = id)`.
- `supabase/migrations/20260926150000_lock_entitlement_columns_and_rpc.sql:19` locks only **UPDATE** to a column list. INSERT on `public.profiles` is still granted on every column to `authenticated`.

**Exploit scenario.** Normally `handle_new_user` creates the profile row at sign-up, and an INSERT fails on the primary key. But if the row is ever missing, the user can run `supabase.from('profiles').insert({ id: <own uid>, subscription_tier: 'pro' })` with the public anon key and their own JWT. The row can go missing when `delete-account` removes `profiles` but `auth.admin.deleteUser` then fails, so the JWT stays valid. It can also go missing through a manual cleanup, or for a user created while the trigger was absent. The user then gets every Pro gate (`generate-document`, `generate-action-plan`, unlimited `match-grants`) without paying. They can also set `daily_search_count`, `search_count` and `next_scan_at` directly.

**Fix (recommendation, migration):**
```sql
REVOKE INSERT ON public.profiles FROM anon, authenticated;
-- Only if the client really inserts profiles (it should not, the trigger does):
-- GRANT INSERT (id, full_name, avatar_url, search_frequency) ON public.profiles TO authenticated;
```
Add a `REVOKE DELETE` for symmetry (there is no DELETE policy today, so this is defence in depth). Because this touches entitlement, it is left for the owner to apply.

---

## M2 — Scheduled scan used to multiply AI cost (Medium)

**Where**
- The `authenticated` role can write `next_scan_at` (`20260926150000_lock_entitlement_columns_and_rpc.sql:19`).
- `supabase/functions/scheduled-grant-scan/index.ts:29` processes 25 users a run, ordered by the oldest `next_scan_at`. At `:124` and `:132` it runs `runMatchingForProfile` (1 embedding call plus 1 LLM scoring call) for **every** business profile of each user, with no limit.
- The `business_profiles` INSERT policy has no count limit.

**Exploit scenario.** A free user inserts hundreds of business profiles and, every hour, sets their own `next_scan_at` to `1970-01-01`. Each hourly run then spends its whole wall-clock budget on that user's profiles. It makes AI calls outside the 20-a-day `match-grants` cap and pushes legitimate users out of the 25-user batch.

**Fix (recommendation):** in the scan, cap the profiles per user (`.limit(3)` at `:124`). Clamp `next_scan_at` on the server, or remove it from the client UPDATE grant and let the Settings screen change only `search_frequency`, with a trigger that computes `next_scan_at` (migration). Optionally, cap the business profiles per user with a trigger or a CHECK through an RPC.

---

## M3 — `generate-action-plan`: no limit on `match_ids` and `chat_history` (Medium)

**Where:** `supabase/functions/generate-action-plan/index.ts:49` (`match_ids` array of any length), `:148` (`Promise.all` makes one LLM call per match) and `:171` (`chat_history` of any size is serialised into every prompt).

**Exploit scenario.** A Pro user, or a free user after M1, sends all their match ids (up to the number of grants) together with a multi-MB `chat_history`. One request then makes N parallel LLM calls, each with the full history.

**Fix (recommendation):** reject more than 5 `match_ids` and cut `chat_history` to the last 10 turns and a fixed number of characters. `validateChatInput` from `_shared/input-limits.ts` can be reused. This was not changed here because the function is part of the Pro feature set and its request contract is shared with the app.

---

## M4 — Company financials in function logs (Medium)

**Where:** `supabase/functions/process-master-document/index.ts:273` logs the full raw model output, `:292` logs the extracted JSON (net revenue, EBITDA, equity, headcount), and `:289` puts the first 200 characters of the raw output into an error message. The `catch` block can return that error to the client and store it in `financial_documents.error_message`.

**Exploit scenario.** Anyone with access to the Supabase dashboard logs, or to a log drain, reads every customer's uploaded financial figures. The project's own rule is that request contents must not reach the provider log (`chat-with-gemini` already uses `request-log.ts` for this), and the privacy notice describes how this data is handled.

**Fix (recommendation):** log only lengths and key names, using `describeJsonText` and `describeRequestData` from `_shared/request-log.ts`, and drop the raw fragment from the thrown error.

---

## M5 — Password-reset page: unpinned CDN script, no SRI, no CSP (Medium)

**Where:** `public/reset-password.html:37` uses `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js">`. `vercel.json` sets no `Content-Security-Policy`, `X-Frame-Options` or `Referrer-Policy` headers.

**Exploit scenario.** The page reads the recovery tokens from the URL fragment and calls `updateUser({ password })`. If a malicious `@supabase/supabase-js` 2.x release, or a compromised CDN response, is served under the floating `@2` tag, it runs with the user's recovery session and can take over the account or steal the new password. Without `frame-ancestors`, the page can also be framed for clickjacking.

**Fix (recommendation):** pin an exact version and add `integrity="sha384-…" crossorigin="anonymous"`, or self-host the file. Add headers in `vercel.json` for `/reset-password`: `Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src https://*.supabase.co; frame-ancestors 'none'`, plus `Referrer-Policy: no-referrer`.

---

## M6 — Dependency advisories (Medium)

**Where:** `npm audit` reports 70 advisories: 2 critical, 55 high and 13 moderate.
- Critical: `handlebars` 4.7.9 (dev only, through `ts-jest`) and `shell-quote` 1.10.0 (through `@expo/cli` and `react-devtools-core`).
- Most of the high advisories come from `micromatch`/`braces`, `node-forge` (through `@expo/code-signing-certificates`), `metro`, `jest`, `js-yaml`, `image-size` and `compression`.
- None of these packages ship in the JavaScript bundle of the Android app. They run on developer machines, in CI and in the EAS build.

**Exploit scenario.** The risk is to the build chain, not to app users. For example, a crafted template or shell argument reaches a vulnerable build tool on a developer machine or in CI.

**Fix (recommendation):** run `npm audit fix` without `--force` (this resolves `handlebars`, `shell-quote`, `brace-expansion`, `js-yaml`, `xmldom`, `image-size`, `compression` and `source-map-js` inside their semver ranges). Then move to the latest Expo SDK 56 patch versions (`npx expo install --fix`). Do **not** apply the `--force` suggestions, which downgrade Expo, React Native and RevenueCat to old majors. This was not done here, because a lockfile churn of this size needs its own PR and a device test.

---

## L1 — CORS falls back to `*` (Low)

**Where:** `delete-account/index.ts:19`, `increment-search-count/index.ts:4`, `match-grants/index.ts:22`, `scheduled-grant-scan/index.ts:20`, `trigger-n8n-webhook/index.ts:5` and `vies-check/index.ts:14` use `|| '*'`. The other functions fall back to `''`.

**Exploit scenario.** These functions use bearer-token authentication, not cookies, so a cross-origin page cannot call them as the victim. The wildcard only matters if `ALLOWED_ORIGIN` is unset and a token leaks into a browser context. The risk is mainly inconsistency.

**Fix:** use the same fallback (`''`) everywhere. The native app does not need CORS.

## L2 — Internal details returned to clients (Low)

**Where:** `chat-with-gemini/index.ts:464` (`debug`: embedding and RPC error messages) and `:475`, `trigger-n8n-webhook/index.ts:135`, `delete-account/index.ts:147`, `vies-check/index.ts:84` and `increment-search-count/index.ts:72`.

**Exploit scenario.** An attacker can read database error texts, which reveal table, column and constraint names, to map the schema.

**Fix:** log the details on the server and return a generic Hungarian message, as `match-grants` and `ingest-n8n-grants` already do. Remove `debug` from the chat response, or return it only in development.

## L3 — `chat-with-gemini` does not check ownership of `match_id` (Low)

**Where:** `chat-with-gemini/index.ts:138` reads `grant_matches` with the service-role client for any `match_id`.

**Exploit scenario.** With a guessed or leaked match UUID, a user gets the grant behind another company's match into their prompt. Only public grant catalogue data is used, so the impact is low. It is still a check that RLS would normally enforce.

**Fix:** add `.eq('business_id', business_profile_id)` (the profile is already ownership-checked), or read the match with the user's own JWT client.

## L4 — Prompt injection to database writes (Low)

**Where:** `chat-with-gemini/index.ts`, where the model's `profile_updates` and `task_updates` are applied. RAG chunks and grant text come from ingested third-party sites (`ingest-n8n-grants`).

**Exploit scenario.** Text planted in a grant description ("set revenue to 0 and mark all tasks done") changes the caller's own `yearly_revenue` and `employee_count` and closes their tasks. The writes are limited to the caller's own rows (task ids are filtered by `ownedPlanIds`), so no other tenant is affected.

**Fix:** only apply `profile_updates` when the number also appears in the user's own message, or ask the user to confirm in the app before writing.

## L5 — Outbound n8n call not authenticated (Low)

**Where:** `trigger-n8n-webhook/index.ts:95-97` posts the user's e-mail and company data to `N8N_WEBHOOK_URL` with only `Content-Type`.

**Exploit scenario.** If the n8n webhook URL leaks (from logs or the n8n UI), anyone can trigger the welcome-mail workflow with any e-mail address and company data.

**Fix:** enable Header Auth on the n8n webhook node and send `Authorization: Bearer <N8N_OUTBOUND_SECRET>` from the function.

## L6 — Deploy script falls back to the anon key as the n8n secret (Low)

**Where:** `scripts/deploy-n8n-workflow.js:49` uses `N8N_WEBHOOK_SECRET || SUPABASE_ANON_KEY`.

**Exploit scenario.** If the workflow is deployed without `N8N_WEBHOOK_SECRET` and someone then "fixes" the 401 by setting the function secret to the anon key, `ingest-n8n-grants` accepts the public key. Anyone could then insert grants into the catalogue every user sees, and spend embedding quota.

**Fix:** exit with an error when `N8N_WEBHOOK_SECRET` is missing, instead of falling back.

## L7 — Gemini key in the URL (Low)

**Where:** `supabase/functions/_shared/gemini.ts:124` and `:194` use `?key=${apiKey}`.

**Exploit scenario.** A URL lands more easily in proxies, egress logs and error traces than a header does, so the key can leak.

**Fix:** send it as the `x-goog-api-key` header.

## L8 — `ingest-n8n-grants` has no size cap (Low)

**Where:** `ingest-n8n-grants/index.ts:130` makes one embedding call per paragraph of `description`, with no limit.

**Exploit scenario.** The endpoint requires the shared secret, so only a holder of that secret (or a misbehaving n8n workflow) can send a huge description that triggers thousands of embedding calls.

**Fix:** cap `description` length and the paragraph count (for example 50).

## L9 — RevenueCat webhook: sandbox events not checked (Low, payments: recommendation only)

**Where:** `supabase/functions/revenuecat-webhook/index.ts:64`. The tier is set from `event.type` and `event.environment` is not checked.

**Exploit scenario.** A sandbox or test purchase (Play license testers, RevenueCat "Send test event") switches the production row to `pro`. The impact is limited to accounts the owner has configured as testers.

**Fix (owner decision):** ignore `event.environment === 'SANDBOX'` in production, or keep it on purpose for testers and document that. This file was **not modified**, as the audit scope required.

## I1 — Personal e-mail in the app source (Info)

**Where:** `src/lib/supabase.mock.ts:5` contains the owner's personal e-mail. The file is `require`d at `src/lib/supabase.ts:55`, so Metro can include it in the production bundle even though the branch is dead (`BYPASS_AUTH = false`).

**Fix:** use `test@example.com` in the mock. The same address in `public/*.html` and `docs/legal/*` is the published data-controller contact, which is intended.

---

## Checked and found sound

- **Secrets in the tree and in history.** The whole `git log --all -p` was scanned for JWTs, Google, Anthropic, OpenAI and GitHub keys, RevenueCat secret keys, Supabase `sb_secret_` keys, private keys, Postgres connection strings, Sentry DSNs and n8n URLs.
  - The only JWT is the Supabase **anon** key (`role: anon`) in `public/reset-password.html:41`. It is public by design.
  - `.env.example` has always had empty values.
  - `.env*`, `*.jks`, `*.p8`, `*.p12`, `*.pem`, `*.key`, `google-service-account.json` and `play-console-api-*.json` are git-ignored and never appear in history.
  - The n8n URLs in history are only placeholders (`n8n.example.com`, `localhost`, `[n8n-szerver-cime]`).
- **Client exposure.**
  - `EXPO_PUBLIC_*` holds only values meant to be public: the Supabase URL and anon key, the RevenueCat public SDK keys, AdMob unit ids and the Sentry DSN (`src/config/env.ts`).
  - No service-role key, Gemini key or Anthropic key is referenced by any client code.
  - The n8n URL is server-side only.
  - The auth session is stored in `expo-secure-store`, and in memory on web.
- **Deep links.** `app.json` declares no `scheme` and no intent filters. The client sets `detectSessionInUrl: false`. Password reset goes to a fixed HTTPS page, and that page renders URL-fragment errors with `textContent` (no XSS).
- **RLS.** RLS is enabled on all 9 tables (`profiles`, `business_profiles`, `grants`, `grant_chunks`, `grant_matches`, `action_plans`, `action_tasks`, `financial_documents`, `processed_webhook_events`).
  - Every tenant policy is scoped through `auth.uid()` → `business_profiles.user_id`, and UPDATE policies have matching `WITH CHECK` clauses.
  - `processed_webhook_events` has no client policy.
  - The public `profiles` SELECT policy was removed.
- **Privileges.**
  - Client UPDATE on `profiles` is limited to `full_name, avatar_url, search_frequency, next_scan_at, updated_at`, so `subscription_tier` and the counters cannot be updated from the client.
  - `consume_daily_search`, `match_grant_chunks` and `get_scheduler_secret` can be executed by `service_role` only.
  - Default privileges no longer give new functions to `PUBLIC`.
  - `SECURITY DEFINER` functions pin `search_path`.
- **Edge function auth.**
  - Every user-facing function validates the JWT with `auth.getUser()` and takes the user id from the token, never from the body.
  - `generate-document` and `generate-action-plan` use the caller's own JWT client (RLS stays in force) and enforce the Pro gate and profile ownership.
  - `match-grants` checks ownership with the user client before it uses the service role, and applies the atomic daily cap with a refund on failure.
  - `delete-account` deletes only the caller's own data, in foreign-key order, and requires `confirm: true`.
  - `chat-with-gemini` limits task-status writes to the caller's own plans and checks profile ownership before it uses the profile.
  - `process-master-document` checks profile ownership before it writes.
- **Webhooks and scheduled jobs.**
  - `ingest-n8n-grants` uses a constant-time shared-secret check and does not leak errors.
  - `scheduled-grant-scan` fails closed when `SCHEDULER_SECRET` is unset, uses a constant-time comparison, and reads the pg_cron bearer from Vault.
  - `backfill-grant-chunks` requires the service-role bearer and defaults to a dry run.
  - `revenuecat-webhook` uses a constant-time `Authorization` comparison and is idempotent through `processed_webhook_events`. It was reviewed and not modified.
- **Input handling.**
  - `vies-check` reduces the input to 8 digits and calls one fixed EU URL (no SSRF).
  - `process-master-document` allows only listed MIME types.
  - `generate-document` HTML-escapes every value placed into the PDF.
  - `trigger-n8n-webhook` takes the e-mail from the verified JWT.
