# P-Search Mobil – Architecture

This document is derived **only from the code in this repository**. It does not describe
the live Supabase project, the RevenueCat/AdMob dashboards or any n8n instance. Every factual
statement carries a `file:line` citation. Where the repo and the (unseen) production state
may differ, this is called out explicitly.

Contents

1. [Screens and navigation](#1-screens-and-navigation)
2. [Data flow: app → Supabase](#2-data-flow-app--supabase)
3. [Edge Functions (`supabase/functions`)](#3-edge-functions-supabasefunctions)
4. [External services](#4-external-services)
5. [Statements in `conductor/tech-stack.md` contradicted by the code](#5-statements-in-conductortech-stackmd-contradicted-by-the-code)
6. [Observations found while mapping (not fixed here)](#6-observations-found-while-mapping-not-fixed-here)

---

## 1. Screens and navigation

### 1.1 App shell

- Provider tree: `BillingProvider` → `ProfileProvider` → `PaperProvider` (MD3 light theme) →
  `NavigationContainer` (App.tsx:36-43, App.tsx:71-93).
- A single native-stack navigator is used (App.tsx:34, App.tsx:75); headers are hidden
  (App.tsx:75). There are no tab or drawer navigators.
- Auth gate: when `session.user` exists the stack contains Home, Onboarding, Paywall (modal),
  Settings, DocumentUpload, ActionPlan and CopilotChat; otherwise only Auth (App.tsx:76-88).
  Home is therefore the initial authenticated screen (App.tsx:78).
- The session comes from `supabase.auth.getSession()` (App.tsx:61) and
  `supabase.auth.onAuthStateChange` (App.tsx:65). Switching between the two stacks is driven
  purely by this state; AuthScreen never navigates.
- Sentry is initialised only when `SENTRY_DSN` is set (App.tsx:27-32); the AdMob SDK is
  initialised on mount (App.tsx:51-52).
- Route params (src/types/navigation.ts:5-17): `ActionPlan` takes
  `{ matchId: string; businessProfileId?: string }` (src/types/navigation.ts:12-15);
  `CopilotChat` takes `{ matchId?: string } | undefined` (src/types/navigation.ts:16); all
  others take none.

### 1.2 Screens

| Screen | Purpose | Outgoing navigation |
|---|---|---|
| `AuthScreen` | E-mail/password sign-in (src/screens/AuthScreen.tsx:44), sign-up (src/screens/AuthScreen.tsx:56), password reset e-mail (src/screens/AuthScreen.tsx:89) | none (auth state change swaps the stack, App.tsx:76-88) |
| `HomeScreen` | Grant match list, "new AI search", ads; data via `useHomeData` (src/screens/HomeScreen.tsx:29) | `ActionPlan {matchId}` (src/screens/HomeScreen.tsx:67), `DocumentUpload` (src/screens/HomeScreen.tsx:82), `Settings` (src/screens/HomeScreen.tsx:89); via the hook: `replace('Onboarding')` when no business profile exists (src/hooks/useHomeData.ts:120), `Paywall` on daily limit / pro_required (src/hooks/useHomeData.ts:180, src/hooks/useHomeData.ts:185), `Onboarding` (src/hooks/useHomeData.ts:204) |
| `OnboardingScreen` | Company profile form with VIES pre-fill (src/screens/OnboardingScreen.tsx:38) | `replace('Home')` after save (src/screens/OnboardingScreen.tsx:105) |
| `PaywallScreen` | RevenueCat package list / restore (uses `useBilling`, src/screens/PaywallScreen.tsx:19) | `goBack()` (src/screens/PaywallScreen.tsx:52, src/screens/PaywallScreen.tsx:63) |
| `SettingsScreen` | Scan frequency, last/next scan, Pro entry, account deletion | back or `Home` (src/screens/SettingsScreen.tsx:198), `Paywall` (src/screens/SettingsScreen.tsx:223) |
| `DocumentUploadScreen` | Pick PDF/image, send to OCR, show extracted financials (src/screens/DocumentUploadScreen.tsx:127-137) | back or `Home` (src/screens/DocumentUploadScreen.tsx:172) |
| `ActionPlanScreen` | Action plans + tasks, plan generation, PDF export; uses `useProfile`, `useInterstitialAd`, `useActionPlan` (src/screens/ActionPlanScreen.tsx:22, src/screens/ActionPlanScreen.tsx:29, src/screens/ActionPlanScreen.tsx:34) | `replace('Onboarding')` (src/screens/ActionPlanScreen.tsx:89), back or `Home` (src/screens/ActionPlanScreen.tsx:102), `Paywall` (src/screens/ActionPlanScreen.tsx:163, src/screens/ActionPlanScreen.tsx:208), `Home` (src/screens/ActionPlanScreen.tsx:186) |
| `CopilotChatScreen` | RAG chat via `useCopilotChat` (src/screens/CopilotChatScreen.tsx:73) | back or `Home` (src/screens/CopilotChatScreen.tsx:94) |

**CopilotChat has no entry point.** The route is registered (App.tsx:84), but no
`navigate('CopilotChat', …)` call exists anywhere in `App.tsx` or `src/`; the only references
are type declarations (src/types/navigation.ts:21, src/screens/CopilotChatScreen.tsx:11).

### 1.3 Shared state

- **ProfileContext** loads the caller's single `business_profiles` row
  (src/context/ProfileContext.tsx:74-78), caches it at module level
  (src/context/ProfileContext.tsx:6-8), and re-fetches on auth changes
  (src/context/ProfileContext.tsx:106-116). Used by ActionPlan, CopilotChat and DocumentUpload
  (src/screens/ActionPlanScreen.tsx:22, src/screens/CopilotChatScreen.tsx:63,
  src/screens/DocumentUploadScreen.tsx:77). HomeScreen does **not** use it; `useHomeData`
  fetches the profile itself (src/hooks/useHomeData.ts:85-89).
- **BillingContext** is RevenueCat-only (no Supabase table reads); see §4.1.

---

## 2. Data flow: app → Supabase

### 2.1 Client

- The client is created with the **anon key** only:
  `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, …)` (src/lib/supabase.ts:37-44). The
  session is persisted in `expo-secure-store` (src/lib/supabase.ts:9-19), or an in-memory map
  on web (src/lib/supabase.ts:21-35).
- Config comes from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  (src/config/env.ts:7-8).
- A dev-only mock proxy exists but is off: `BYPASS_AUTH = false` (src/lib/supabase.ts:46), and
  it applies only when `BYPASS_AUTH && __DEV__` (src/lib/supabase.ts:51).
- The client never calls `supabase.rpc(...)` or `supabase.storage`, and never `fetch`es a
  function URL directly. Grepping `src/` and `App.tsx` for `.rpc(`, `storage.from` and
  `fetch(` finds no non-test hits. Files are sent to Edge Functions inline as base64
  (src/screens/DocumentUploadScreen.tsx:127-137).

Because the client only ever holds the anon key plus the user JWT, **every direct table
call below is authorised solely by Postgres RLS**.

### 2.2 Tables

The schema is split across two sources:

- `supabase-schema.sql` is the only place that creates `profiles` (supabase-schema.sql:5-13),
  `business_profiles` (supabase-schema.sql:16-27), `grant_matches`
  (supabase-schema.sql:45-53), `action_plans` (supabase-schema.sql:83-91) and `action_tasks`
  (supabase-schema.sql:94-103).
- The migrations create the rest:
  - `grants` (supabase/migrations/20260618102838_init_rag_grants.sql:5-18)
  - `grant_chunks`, with a `vector(768)` column
    (supabase/migrations/20260618102838_init_rag_grants.sql:21-28)
  - `financial_documents`
    (supabase/migrations/20260630120000_add_financial_metrics_to_profile.sql:70-84)
  - `processed_webhook_events` (supabase/migrations/20260912150000_daily_search_cap.sql:64-67)

The migrations only alter the five tables from `supabase-schema.sql`; they never create them.
A migration-only rebuild would therefore fail. The first failure is the `action_tasks`
policies, which sit outside the table-exists guard
(supabase/migrations/20260618102839_action_tasks_rls.sql:23-34).

Effective RLS per table, after all migrations:

| Table | Final policies (repo view) |
|---|---|
| `profiles` | SELECT / INSERT / UPDATE where `(select auth.uid()) = id` (supabase/migrations/20260822090000_security_and_performance_hardening.sql:13-27). The UPDATE policy has no `WITH CHECK` and no column restriction (supabase/migrations/20260822090000_security_and_performance_hardening.sql:25-27). No DELETE policy. |
| `business_profiles` | SELECT / INSERT / UPDATE where `user_id = (SELECT auth.uid())` (supabase/migrations/20260630120000_add_financial_metrics_to_profile.sql:56-67). No DELETE policy. |
| `grants` | SELECT for authenticated (supabase-schema.sql:72); ALL for `service_role` (supabase/migrations/20260618102838_init_rag_grants.sql:60-64). The migration's own authenticated SELECT policy is dropped (supabase/migrations/20260822090000_security_and_performance_hardening.sql:32). |
| `grant_chunks` | SELECT for authenticated, `USING (true)` (supabase/migrations/20260618102838_init_rag_grants.sql:54-57); ALL for `service_role` (supabase/migrations/20260618102838_init_rag_grants.sql:66-70). |
| `grant_matches` | SELECT / INSERT / UPDATE / DELETE where `business_id` belongs to one of the caller's `business_profiles` (supabase/migrations/20260817120000_scheduling_and_matching.sql:114-149). |
| `action_plans` | SELECT / INSERT / UPDATE / DELETE where `business_profile_id` belongs to the caller (supabase/migrations/20260813120000_action_plans_rls.sql:25-68). |
| `action_tasks` | SELECT / INSERT / UPDATE / DELETE where the parent `action_plans` row belongs to the caller (supabase/migrations/20260618102839_action_tasks_rls.sql:23-86). |
| `financial_documents` | SELECT / INSERT / UPDATE where `business_profile_id` belongs to the caller (supabase/migrations/20260630120000_add_financial_metrics_to_profile.sql:91-122). |
| `processed_webhook_events` | RLS on, no policies, so service role only (supabase/migrations/20260912150000_daily_search_cap.sql:68-70). |

SQL functions used by the code:

- `match_grant_chunks(vector, float, int)` is SECURITY INVOKER
  (supabase/migrations/20260618102838_init_rag_grants.sql:77-105).
- `consume_daily_search(p_user, p_cap)` is SECURITY DEFINER
  (supabase/migrations/20260912150000_daily_search_cap.sql:15-20).
- `handle_new_user()` is a SECURITY DEFINER trigger on `auth.users` that creates the
  `profiles` row (supabase/migrations/20260817120000_scheduling_and_matching.sql:158-175).
- `get_scheduler_secret()` is SECURITY DEFINER and executable by `service_role` only
  (supabase/migrations/20260817130000_schedule_grant_scan_cron.sql:59-76).

### 2.3 Direct table calls from the app

"RLS-scoped" means the query has **no filter on the caller's identity**. Row ownership is
enforced only by the policies above.

| Call site | Table / op | Filter | Depends on RLS for ownership? |
|---|---|---|---|
| src/context/ProfileContext.tsx:74-78 | `business_profiles` select | `user_id = session user` (src/context/ProfileContext.tsx:77) | No; the RLS policy is defence in depth |
| src/hooks/useHomeData.ts:85-89 | `business_profiles` select | `user_id = session user` (src/hooks/useHomeData.ts:88) | No |
| src/hooks/useHomeData.ts:90-94 | `profiles` select | `id = session user` (src/hooks/useHomeData.ts:93) | No |
| src/hooks/useHomeData.ts:108-112 | `grant_matches` select, embeds `grants(*)` | `business_id = profile.id` only | **Yes**: `grant_matches` SELECT policy, plus the `grants` SELECT policy for the embed |
| src/screens/OnboardingScreen.tsx:76-90 | `business_profiles` insert | payload `user_id: session.user.id` (src/screens/OnboardingScreen.tsx:80) | **Yes**: the INSERT `WITH CHECK` is what stops a forged `user_id` |
| src/screens/SettingsScreen.tsx:105-109 | `profiles` select | `id = session user` | No |
| src/screens/SettingsScreen.tsx:143-149 | `profiles` update (`search_frequency`, `next_scan_at`) | `id = session user` | Partly: the UPDATE policy restricts rows but not columns (see §6) |
| src/hooks/useActionPlan.ts:18-23 | `action_plans` select, embeds `action_tasks(*)` | `business_profile_id` only | **Yes**: `action_plans` and `action_tasks` SELECT policies |
| src/hooks/useActionPlan.ts:54-57 | `action_tasks` update (`status`) | `id = taskId` only | **Yes, entirely**: only the `action_tasks` UPDATE policy prevents editing another user's task by ID |

There are no client-side `upsert` or `delete` calls on tables. Account deletion goes through
the `delete-account` function (src/screens/SettingsScreen.tsx:170-172).

### 2.4 Edge Function calls from the app

| Call site | Function | Body |
|---|---|---|
| src/hooks/useHomeData.ts:21-23 | `match-grants` | `{ business_profile_id }` |
| src/hooks/useHomeData.ts:59-65 | `trigger-n8n-webhook` | `{ business_id, action: 'new_search_pro' \| 'new_search_free' }` |
| src/screens/OnboardingScreen.tsx:38 | `vies-check` | `{ tax_number }` |
| src/screens/OnboardingScreen.tsx:96-101 | `trigger-n8n-webhook` | `{ business_id, action: 'new_profile_created' }` |
| src/hooks/useActionPlan.ts:85-87 | `generate-action-plan` | `{ business_profile_id, match_ids, match_id }` |
| src/components/action-plan/ActionPlanCard.tsx:112-117 | `generate-document` | `{ business_profile_id, match_id }` |
| src/hooks/useCopilotChat.ts:118-125 | `chat-with-gemini` | `{ message, history, business_profile_id, match_id }` |
| src/screens/DocumentUploadScreen.tsx:127-137 | `process-master-document` | `{ business_profile_id, file_base64, mime_type, file_name }` |
| src/screens/SettingsScreen.tsx:170-172 | `delete-account` | `{ confirm: true }` |

Functions that create an **anon client with the caller's JWT** keep RLS in force for their
queries. Functions that use the **service-role key** bypass RLS and must check ownership in
code. §3 states which client each function uses.

---

## 3. Edge Functions (`supabase/functions`)

`supabase/config.toml` has no `[functions.*]` section and no `verify_jwt` key. Grepping for
`verify_jwt` and `\[functions` returns nothing, so gateway JWT verification is not configured
per function in the repo. For the secret-authenticated endpoints (`revenuecat-webhook`,
`ingest-n8n-grants`, `scheduled-grant-scan`), how they are actually deployed cannot be seen
from the code.

### 3.1 Shared modules (`_shared/`)

| Module | Exports / behaviour | Used by |
|---|---|---|
| `gemini.ts` | Constants: `gemini-embedding-001` (supabase/functions/_shared/gemini.ts:13), 768 dims (supabase/functions/_shared/gemini.ts:14), `gemini-2.5-flash` (supabase/functions/_shared/gemini.ts:15), v1beta REST base (supabase/functions/_shared/gemini.ts:17). `generateEmbedding` (supabase/functions/_shared/gemini.ts:28), `generateText` (supabase/functions/_shared/gemini.ts:68), `parseJsonFromModel` (supabase/functions/_shared/gemini.ts:104-120) | backfill-grant-chunks (supabase/functions/backfill-grant-chunks/index.ts:13), ingest-n8n-grants (supabase/functions/ingest-n8n-grants/index.ts:3), matching.ts (supabase/functions/_shared/matching.ts:23) |
| `matching.ts` | `collectCandidateGrants`: embedding, then RPC `match_grant_chunks`, then a fallback to open `grants` (supabase/functions/_shared/matching.ts:101-164). `scoreCandidates`: one Gemini JSON call (supabase/functions/_shared/matching.ts:170-247). `runMatchingForProfile`: upserts `grant_matches` on `business_id,grant_id` for score ≥ 40 (supabase/functions/_shared/matching.ts:257-311). `computeNextScanAt` (supabase/functions/_shared/matching.ts:318-326) | match-grants (supabase/functions/match-grants/index.ts:3), scheduled-grant-scan (supabase/functions/scheduled-grant-scan/index.ts:3) |
| `entitlement.ts` | `PRO_TIER='pro'`, `FREE_DAILY_SEARCH_CAP=20` (supabase/functions/_shared/entitlement.ts:7-8). `getSubscriptionTier` reads `profiles.subscription_tier` and defaults to `'free'` (supabase/functions/_shared/entitlement.ts:16-24) | generate-action-plan (supabase/functions/generate-action-plan/index.ts:4), generate-document (supabase/functions/generate-document/index.ts:3), match-grants (supabase/functions/match-grants/index.ts:4) |
| `daily-search-refund.ts` | `refundDailySearch` decrements today's `daily_search_count` (supabase/functions/_shared/daily-search-refund.ts:23-36) | match-grants (supabase/functions/match-grants/index.ts:124) |
| `match-ownership.ts` | `foreignMatchIds` compares `business_id` (supabase/functions/_shared/match-ownership.ts:15-22) | generate-action-plan (supabase/functions/generate-action-plan/index.ts:117) |
| `grant-chunking.ts` | `buildGrantText` / `splitParagraphs` / `chunkGrant` (supabase/functions/_shared/grant-chunking.ts:21-43) | backfill-grant-chunks (supabase/functions/backfill-grant-chunks/index.ts:14) |
| `request-log.ts` | Logs the shape of data only, never values (supabase/functions/_shared/request-log.ts:7-49) | chat-with-gemini (supabase/functions/chat-with-gemini/index.ts:4-9) |

### 3.2 Functions

#### `backfill-grant-chunks`
- **Auth:** POST only (supabase/functions/backfill-grant-chunks/index.ts:29). The bearer must
  equal the service-role key (supabase/functions/backfill-grant-chunks/index.ts:30-34).
- **Input:** `{ dry_run?: boolean, limit?: number }`. Dry run is the default; `limit` is
  clamped to 1..500 (supabase/functions/backfill-grant-chunks/index.ts:35-38).
- **Client / data:** service role (supabase/functions/backfill-grant-chunks/index.ts:40).
  - Reads `grant_chunks` and `grants` (supabase/functions/backfill-grant-chunks/index.ts:41-46).
  - Inserts `grant_chunks` with Gemini embeddings
    (supabase/functions/backfill-grant-chunks/index.ts:64-68).
- **Output:**
  - Dry run: `{ dry_run: true, grants_total, grants_covered, grants_to_backfill, chunks_planned, plan }`
    (supabase/functions/backfill-grant-chunks/index.ts:52-54).
  - Write run: `{ dry_run: false, grants_to_backfill, chunks_planned, chunks_inserted, failed }`
    (supabase/functions/backfill-grant-chunks/index.ts:75).
- **Callers:** none in the repo. It is not called from `src/`, `scripts/`, the migrations or
  CI. The CI Deno steps do not include it (.github/workflows/ci.yml:25-29).

#### `chat-with-gemini`
- **Auth:** `Authorization` is required (supabase/functions/chat-with-gemini/index.ts:33-40).
  The JWT is validated with `auth.getUser()` on an anon client
  (supabase/functions/chat-with-gemini/index.ts:51-67). There is no method check.
- **Input:** `prompt | message | text`, `history`, `business_profile_id`, `match_id`
  (supabase/functions/chat-with-gemini/index.ts:76-80). An empty message returns 400
  (supabase/functions/chat-with-gemini/index.ts:86-92).
- **Client / data:** the **service role** does all data access
  (supabase/functions/chat-with-gemini/index.ts:44-48).
  - Reads `business_profiles` with an ownership check that returns 403
    (supabase/functions/chat-with-gemini/index.ts:108-115).
  - Reads `grant_matches` by `match_id` (supabase/functions/chat-with-gemini/index.ts:130-134).
  - Reads `action_plans` and `action_tasks`
    (supabase/functions/chat-with-gemini/index.ts:157-172).
  - Calls RPC `match_grant_chunks` (supabase/functions/chat-with-gemini/index.ts:234-241).
  - Updates `business_profiles` (supabase/functions/chat-with-gemini/index.ts:392-395).
  - Updates `action_tasks.status` for task IDs returned by the model
    (supabase/functions/chat-with-gemini/index.ts:416-419).
- **External:** the `npm:@google/generative-ai` SDK
  (supabase/functions/chat-with-gemini/index.ts:3), using `gemini-embedding-001`
  (supabase/functions/chat-with-gemini/index.ts:209-215) and `gemini-2.5-flash`
  (supabase/functions/chat-with-gemini/index.ts:350-358).
- **Output:**
  - 200: `{ reply, database_updated, sources, debug }`
    (supabase/functions/chat-with-gemini/index.ts:439-450).
  - 500: `{ error: err.message }` (supabase/functions/chat-with-gemini/index.ts:451-461).
- **Callers:**
  - src/hooks/useCopilotChat.ts:118
  - scripts/test-rag-query.js:31

#### `delete-account`
- **Auth:** POST only (supabase/functions/delete-account/index.ts:41-43). The JWT is checked
  with `getUser` (supabase/functions/delete-account/index.ts:46-59).
- **Input:** `{ confirm: true }`, otherwise 400
  (supabase/functions/delete-account/index.ts:63-71).
- **Client / data:** service role (supabase/functions/delete-account/index.ts:73-77). It
  deletes the caller's rows in this order:
  1. `grant_matches` (supabase/functions/delete-account/index.ts:92-96)
  2. `business_profiles` (supabase/functions/delete-account/index.ts:105-109)
  3. `profiles` (supabase/functions/delete-account/index.ts:116-120)
  4. the auth user, via `auth.admin.deleteUser`
     (supabase/functions/delete-account/index.ts:126)
- **Output:**
  - 200: `{ deleted: true, removed: {…} }` (supabase/functions/delete-account/index.ts:143).
  - 500: `{ error }` (supabase/functions/delete-account/index.ts:144-148).
- **Callers:**
  - src/screens/SettingsScreen.tsx:170
  - CI Deno test (.github/workflows/ci.yml:27)

#### `generate-action-plan`
- **Auth:**
  - `Authorization` is required (supabase/functions/generate-action-plan/index.ts:21-27).
  - Anon client with the user JWT (supabase/functions/generate-action-plan/index.ts:30-34).
  - `getUser` (supabase/functions/generate-action-plan/index.ts:67-76).
  - Ownership check, 403 (supabase/functions/generate-action-plan/index.ts:81-88).
  - Pro gate, 403 `pro_required` (supabase/functions/generate-action-plan/index.ts:91-97).
  - Foreign match IDs, 403 (supabase/functions/generate-action-plan/index.ts:117-128).
- **Input:** `{ business_profile_id (required), match_id?, match_ids?, chat_history? }`
  (supabase/functions/generate-action-plan/index.ts:37-46).
- **Client / data:** user JWT, so RLS applies.
  - Reads `business_profiles` and `grant_matches`
    (supabase/functions/generate-action-plan/index.ts:49-60).
  - Inserts `action_plans` (supabase/functions/generate-action-plan/index.ts:188-202).
  - Inserts `action_tasks` (supabase/functions/generate-action-plan/index.ts:207-248).
- **External:** `esm.sh/@google/generative-ai@0.1.3`
  (supabase/functions/generate-action-plan/index.ts:3) with model `gemini-2.5-flash`
  (supabase/functions/generate-action-plan/index.ts:138-139).
- **Output:**
  - 200: `{ message, plans, tasks, plan }`
    (supabase/functions/generate-action-plan/index.ts:250-262).
  - 500: `{ error }` (supabase/functions/generate-action-plan/index.ts:263-268).
- **Callers:**
  - src/hooks/useActionPlan.ts:85
  - scripts/test-action-plan.js:31

#### `generate-document`
- **Auth:**
  - `Authorization` is required (supabase/functions/generate-document/index.ts:31-40).
  - Anon client with the user JWT (supabase/functions/generate-document/index.ts:43-47).
  - `getUser` (supabase/functions/generate-document/index.ts:65-71).
  - Pro gate, 403 (supabase/functions/generate-document/index.ts:74-80).
  - Ownership check, 403 (supabase/functions/generate-document/index.ts:103-108).
- **Input:** `{ business_profile_id, match_id }`, both required
  (supabase/functions/generate-document/index.ts:50-62).
- **Client / data:** user JWT, so RLS applies.
  - Reads `business_profiles` and `grant_matches`
    (supabase/functions/generate-document/index.ts:87-96).
  - Reads `action_plans` (supabase/functions/generate-document/index.ts:298-303).
  - Updates `action_plans.ai_context` (supabase/functions/generate-document/index.ts:312-318).
- **External:** direct REST call to Gemini `gemini-2.5-flash:generateContent`
  (supabase/functions/generate-document/index.ts:142-176).
- **Output:**
  - 200: `{ html }` (supabase/functions/generate-document/index.ts:328-331).
  - 500: a generic error (supabase/functions/generate-document/index.ts:332-343).
- **Callers:** src/components/action-plan/ActionPlanCard.tsx:112.

#### `increment-search-count`
- **Auth:** `Authorization` is required; a missing header yields **400**, not 401
  (supabase/functions/increment-search-count/index.ts:26-29,
  supabase/functions/increment-search-count/index.ts:70-75). `getUser` is called at
  supabase/functions/increment-search-count/index.ts:43-44.
- **Input:** none.
- **Client / data:** service role (supabase/functions/increment-search-count/index.ts:38-41).
  Reads `profiles.search_count` and increments it
  (supabase/functions/increment-search-count/index.ts:46-62).
- **Output:** 200 `{ allowed: true, newCount }`
  (supabase/functions/increment-search-count/index.ts:66-69).
- **Callers:** **none in the app.**
  - A comment says the app no longer calls it (src/hooks/useHomeData.ts:211).
  - Only its Deno test in CI references it (.github/workflows/ci.yml:25).

#### `ingest-n8n-grants`
- **Auth:** the shared secret `N8N_WEBHOOK_SECRET` in `Authorization`, with or without a
  `Bearer` prefix, compared in constant time
  (supabase/functions/ingest-n8n-grants/index.ts:18-58).
- **Input:** `{ title (required), description, provider, grant_type, amount_min, amount_max, deadline, eligibility_criteria, source_url }`
  (supabase/functions/ingest-n8n-grants/index.ts:65-86).
- **Client / data:** service role (supabase/functions/ingest-n8n-grants/index.ts:61-63).
  - Inserts `grants` (supabase/functions/ingest-n8n-grants/index.ts:89-103).
  - Inserts a `grant_chunks` row per description paragraph, with its embedding
    (supabase/functions/ingest-n8n-grants/index.ts:113-161).
- **External:** Gemini embeddings (supabase/functions/ingest-n8n-grants/index.ts:132), skipped
  if `GEMINI_API_KEY` is missing (supabase/functions/ingest-n8n-grants/index.ts:122-126).
- **Output:** 200 `{ message, grant_id, chunks_inserted }`
  (supabase/functions/ingest-n8n-grants/index.ts:175-185).
- **Callers:**
  - The n8n template's HTTP node (docs/n8n-workflow-template.json:57).
  - scripts/deploy-n8n-workflow.js:47-50, which rewrites the template URL and secret.
  - scripts/test-n8n-ingest.js:31

#### `match-grants`
- **Auth:**
  - `Authorization` is required (supabase/functions/match-grants/index.ts:41-44).
  - `getUser` (supabase/functions/match-grants/index.ts:46-59).
  - Ownership is checked with the user client, 403 (supabase/functions/match-grants/index.ts:74-83).
- **Input:** `{ business_profile_id }` (supabase/functions/match-grants/index.ts:61-71).
- **Client / data:** service role for the work (supabase/functions/match-grants/index.ts:91-95).
  - RPC `consume_daily_search(p_user, 20)` (supabase/functions/match-grants/index.ts:101-104):
    - error: 503 (supabase/functions/match-grants/index.ts:105-108)
    - not allowed: 403 `daily_limit` (supabase/functions/match-grants/index.ts:110-115)
  - `runMatchingForProfile` (supabase/functions/match-grants/index.ts:122).
  - Refund on failure (supabase/functions/match-grants/index.ts:123-127).
  - Updates `profiles.last_scan_at` (supabase/functions/match-grants/index.ts:131-134).
- **Output:** 200 `{ success, matches_found, candidates_considered }`
  (supabase/functions/match-grants/index.ts:140-147).
- **Callers:** src/hooks/useHomeData.ts:21.

#### `process-master-document`
- **Auth:**
  - `Authorization` is required (supabase/functions/process-master-document/index.ts:89-98).
  - `getUser` (supabase/functions/process-master-document/index.ts:103-124).
  - Ownership check, 403 (supabase/functions/process-master-document/index.ts:183-196).
- **Input:** `{ business_profile_id, file_base64, mime_type, file_name? }`
  (supabase/functions/process-master-document/index.ts:130-149). `mime_type` must be JPEG,
  PNG, WEBP or PDF (supabase/functions/process-master-document/index.ts:54-60).
- **Client / data:** service role (supabase/functions/process-master-document/index.ts:77-81).
  - Inserts `financial_documents` (supabase/functions/process-master-document/index.ts:202-211).
  - Updates `business_profiles` financial columns
    (supabase/functions/process-master-document/index.ts:283-305).
  - Updates `financial_documents` status
    (supabase/functions/process-master-document/index.ts:316-323,
    supabase/functions/process-master-document/index.ts:366-374).
- **External:** `npm:@google/generative-ai` (supabase/functions/process-master-document/index.ts:3)
  with `gemini-2.5-flash` vision input
  (supabase/functions/process-master-document/index.ts:231-256).
- **Output:** 200 `{ success, document_id, message, extracted_data }`
  (supabase/functions/process-master-document/index.ts:338-357).
- **Callers:**
  - src/screens/DocumentUploadScreen.tsx:127
  - scripts/test-process-master-document.js:160

#### `revenuecat-webhook`
- **Auth:** POST only (supabase/functions/revenuecat-webhook/index.ts:47-49). `Authorization`
  must equal `REVENUECAT_WEBHOOK_SECRET`, compared in constant time
  (supabase/functions/revenuecat-webhook/index.ts:50-54).
- **Input:** `{ event: { id, type, app_user_id } }`
  (supabase/functions/revenuecat-webhook/index.ts:56-61). Event types map to tiers as follows:
  - Pro events (supabase/functions/revenuecat-webhook/index.ts:29-32).
  - `EXPIRATION` and `SUBSCRIPTION_PAUSED` map to free
    (supabase/functions/revenuecat-webhook/index.ts:33).
- **Client / data:** service role (supabase/functions/revenuecat-webhook/index.ts:71-75).
  - Claims `processed_webhook_events` for idempotency
    (supabase/functions/revenuecat-webhook/index.ts:79-89).
  - Updates `profiles.subscription_tier` (supabase/functions/revenuecat-webhook/index.ts:91).
  - Rolls back the claim on error (supabase/functions/revenuecat-webhook/index.ts:92-96).
- **Output:**
  - `{ ok: true, changed: true, tier }` (supabase/functions/revenuecat-webhook/index.ts:97).
  - `{ ok: true, changed: false }` for events that do not change the tier
    (supabase/functions/revenuecat-webhook/index.ts:66-69).
- **Callers:** none in the repo; RevenueCat's servers call it. It is not in the CI Deno steps
  (.github/workflows/ci.yml:25-29).

#### `scheduled-grant-scan`
- **Auth:** `SCHEDULER_SECRET` is required.
  - If the secret is unset, it fails closed with 503
    (supabase/functions/scheduled-grant-scan/index.ts:56-62).
  - The bearer is compared in constant time
    (supabase/functions/scheduled-grant-scan/index.ts:37-48,
    supabase/functions/scheduled-grant-scan/index.ts:64-70).
- **Input:** none.
- **Client / data:** service role (supabase/functions/scheduled-grant-scan/index.ts:78-82).
  - Selects up to 25 due `profiles` (supabase/functions/scheduled-grant-scan/index.ts:88-94).
  - Advances their `last_scan_at` / `next_scan_at`
    (supabase/functions/scheduled-grant-scan/index.ts:109-113).
  - Runs matching for each business profile
    (supabase/functions/scheduled-grant-scan/index.ts:121-134).
- **Output:** 200 `{ success, users_processed, matches_created, failures }`
  (supabase/functions/scheduled-grant-scan/index.ts:150-158).
- **Callers:** a pg_cron job, hourly at minute 7.
  - It uses `net.http_post` to a hard-coded project URL
    (supabase/migrations/20260817130000_schedule_grant_scan_cron.sql:83,
    supabase/migrations/20260817130000_schedule_grant_scan_cron.sql:96-110).
  - The bearer comes from `get_scheduler_secret()`
    (supabase/migrations/20260817130000_schedule_grant_scan_cron.sql:104).

#### `trigger-n8n-webhook`
- **Auth:**
  - `Authorization` is required (supabase/functions/trigger-n8n-webhook/index.ts:28-34).
  - `getUser` (supabase/functions/trigger-n8n-webhook/index.ts:36-48).
  - Ownership is checked through the user client, 403
    (supabase/functions/trigger-n8n-webhook/index.ts:63-75).
- **Input:** `{ business_id, action }`, both required
  (supabase/functions/trigger-n8n-webhook/index.ts:50-57).
- **Client / data:** user JWT, so RLS applies. Reads `business_profiles` only.
- **External:** POST to `N8N_WEBHOOK_URL` (supabase/functions/trigger-n8n-webhook/index.ts:84,
  supabase/functions/trigger-n8n-webhook/index.ts:95-110). It is best-effort: it returns 200
  with `skipped: true` when the URL is unset, unreachable or answers non-2xx
  (supabase/functions/trigger-n8n-webhook/index.ts:85-126).
- **Output:** 200 `{ success: true }` (supabase/functions/trigger-n8n-webhook/index.ts:128-131).
- **Callers:**
  - src/hooks/useHomeData.ts:59
  - src/screens/OnboardingScreen.tsx:96

#### `vies-check`
- **Auth:** POST only (supabase/functions/vies-check/index.ts:60-61). JWT checked with
  `getUser` (supabase/functions/vies-check/index.ts:64-67).
- **Input:** `{ tax_number }`, normalised to 8 digits; fewer digits return 400
  (supabase/functions/vies-check/index.ts:69-72).
- **Client / data:** auth only; no tables.
- **External:** EU VIES REST API (supabase/functions/vies-check/index.ts:20,
  supabase/functions/vies-check/index.ts:41-51).
- **Output:** 200 `{ found, vat, name, address, reason? }`
  (supabase/functions/vies-check/index.ts:75-80).
- **Callers:** src/screens/OnboardingScreen.tsx:38.

---

## 4. External services

### 4.1 RevenueCat
- **Dependency:** `react-native-purchases` (package.json:29).
- **Keys:** `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` and `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
  (src/config/env.ts:4-5).
- **Client calls**, all in `src/context/BillingContext.tsx`:
  - Setup is skipped when the key is missing or a placeholder
    (src/context/BillingContext.tsx:50-62).
  - `Purchases.configure` (src/context/BillingContext.tsx:65, src/context/BillingContext.tsx:68).
  - `Purchases.logIn(session.user.id)` (src/context/BillingContext.tsx:76) makes the RevenueCat
    `app_user_id` equal the Supabase user id.
  - `getCustomerInfo` (src/context/BillingContext.tsx:81) and `getOfferings`
    (src/context/BillingContext.tsx:84).
  - Customer-info listener (src/context/BillingContext.tsx:106).
  - `purchasePackage` (src/context/BillingContext.tsx:136) and `restorePurchases`
    (src/context/BillingContext.tsx:156).
- **Entitlement:** `'pro'` (src/context/BillingContext.tsx:40). In `__DEV__` builds `isPro` is
  forced to true (src/context/BillingContext.tsx:29, src/context/BillingContext.tsx:35-37).
- **Server side:** the `revenuecat-webhook` function writes `profiles.subscription_tier`
  (supabase/functions/revenuecat-webhook/index.ts:91). The server-side Pro checks read that
  column (supabase/functions/_shared/entitlement.ts:16-24), not the RevenueCat SDK.
- **Consumers:**
  - PaywallScreen (src/screens/PaywallScreen.tsx:19)
  - SettingsScreen (src/screens/SettingsScreen.tsx:77)
  - useHomeData (src/hooks/useHomeData.ts:219)

### 4.2 AdMob
- **Dependency:** `react-native-google-mobile-ads` (package.json:27).
- **Config plugin:** Android app ID set in app.json:36-40.
- **SDK init:** App.tsx:51-52.
- **Banner:** `AdBanner` uses `BANNER_AD_UNIT_ID` (src/components/AdBanner.tsx:23-27). It is
  hidden for Pro users and on non-Android platforms (src/components/AdBanner.tsx:16). It is
  rendered on Home (src/screens/HomeScreen.tsx:126) and Onboarding
  (src/screens/OnboardingScreen.tsx:197).
- **Inline banner in the match list:** uses a hard-coded `TestIds.BANNER`
  (src/screens/HomeScreen.tsx:56).
- **Interstitial:** `useInterstitialAd` (src/hooks/useInterstitialAd.ts:26-28) with
  `INTERSTITIAL_AD_UNIT_ID`, used by ActionPlanScreen (src/screens/ActionPlanScreen.tsx:29).
- **Ad unit IDs:** `EXPO_PUBLIC_INTERSTITIAL_AD_UNIT_ID` and `EXPO_PUBLIC_BANNER_AD_UNIT_ID`
  (src/config/env.ts:1-2).
- **Web:** Metro aliases the package to `src/lib/mobileAdsWebStub.ts` (metro.config.js:15-21).

### 4.3 n8n
- **Outbound (app to n8n):**
  - The client invokes `trigger-n8n-webhook` (src/hooks/useHomeData.ts:59,
    src/screens/OnboardingScreen.tsx:96).
  - That function POSTs to `N8N_WEBHOOK_URL`
    (supabase/functions/trigger-n8n-webhook/index.ts:84,
    supabase/functions/trigger-n8n-webhook/index.ts:95-110).
  - The shipped workflow template has a schedule trigger (docs/n8n-workflow-template.json:10)
    and no webhook trigger, so nothing in the repo defines the receiving side.
- **Inbound (n8n to Supabase):** the template's scheduled workflow GETs a grants source
  (docs/n8n-workflow-template.json:25) and POSTs each grant to `ingest-n8n-grants`
  (docs/n8n-workflow-template.json:57).
- **Deployment script:** scripts/deploy-n8n-workflow.js:47-50 sets the callback URL and
  secret, then pushes the workflow through the n8n REST API
  (scripts/deploy-n8n-workflow.js:123-146).
- The client never talks to n8n directly.

### 4.4 Gemini (Google Generative Language API)
All Gemini calls are server-side, in Edge Functions. `GEMINI_API_KEY` is read from the
function environment.

| Where | How | Model(s) |
|---|---|---|
| supabase/functions/_shared/gemini.ts:28-40 | REST `embedContent` | `gemini-embedding-001`, 768 dims |
| supabase/functions/_shared/gemini.ts:68-84 | REST `generateContent` | `gemini-2.5-flash` default |
| supabase/functions/_shared/matching.ts:110, supabase/functions/_shared/matching.ts:224 | via gemini.ts | embedding + flash (called by match-grants and scheduled-grant-scan) |
| supabase/functions/ingest-n8n-grants/index.ts:132 | via gemini.ts | embedding |
| supabase/functions/backfill-grant-chunks/index.ts:64 | via gemini.ts | embedding |
| supabase/functions/chat-with-gemini/index.ts:3, supabase/functions/chat-with-gemini/index.ts:209-215, supabase/functions/chat-with-gemini/index.ts:350-358 | `npm:@google/generative-ai` | embedding + flash |
| supabase/functions/process-master-document/index.ts:3, supabase/functions/process-master-document/index.ts:231-256 | `npm:@google/generative-ai` | flash (vision) |
| supabase/functions/generate-action-plan/index.ts:3, supabase/functions/generate-action-plan/index.ts:138-139 | `esm.sh/@google/generative-ai@0.1.3` | flash |
| supabase/functions/generate-document/index.ts:142-176 | raw REST `generateContent` | flash |

- `@google/generative-ai` is also a dependency of the app (package.json:8). No file in `src/`
  or `App.tsx` imports it.
- Outside the functions, only the seeding script uses Gemini: scripts/seed-grants.js:4.

### 4.5 Others (for completeness)
- **Sentry:** `@sentry/react-native` (package.json:12). Initialised at App.tsx:27-31. Warnings
  and errors are forwarded from src/utils/logger.ts:12-19.
- **EU VIES:** called only from the `vies-check` function
  (supabase/functions/vies-check/index.ts:20).

---

## 5. Statements in `conductor/tech-stack.md` contradicted by the code

| # | Statement (conductor/tech-stack.md) | What the code shows |
|---|---|---|
| 1 | "**Szkriptek:** Node.js, SQLite (Lokális web-rescue szkriptekhez)" (conductor/tech-stack.md:17) | **SQLite does not exist in the repo.** A repo-wide search for `sqlite` or `web-rescue` (excluding `node_modules`) matches only conductor/tech-stack.md:17 itself. `package.json` has no SQLite dependency (package.json:5-55). The scripts write to Supabase, e.g. scripts/ingest-grants/run.ts:93. |
| 2 | "**Workflow Engine:** n8n (… automatikus pályázat gyűjtéshez)" (conductor/tech-stack.md:16): n8n is presented as *the* grant-collection engine | Grant collection in the code does not depend on n8n. scripts/ingest-grants/run.ts:1-13 is a Node orchestrator. It fetches `ginapp-api.fair.gov.hu` (scripts/ingest-grants/fetchTenders.ts:11) and inserts into `grants` (scripts/ingest-grants/run.ts:93). Scheduling in the repo is done by `pg_cron` + `pg_net` (supabase/migrations/20260817130000_schedule_grant_scan_cron.sql:23-24, supabase/migrations/20260817130000_schedule_grant_scan_cron.sql:96-110), which calls `scheduled-grant-scan` for matching. The n8n collector exists only as a template (docs/n8n-workflow-template.json:10-57). |
| 3 | "n8n (A B2B kutatásokhoz …)" (conductor/tech-stack.md:16) | No B2B-research workflow exists in the repo. The only app-to-n8n traffic is a best-effort event notification (`new_profile_created`, `new_search_*`) that carries profile fields (supabase/functions/trigger-n8n-webhook/index.ts:95-110) and is ignored on failure (supabase/functions/trigger-n8n-webhook/index.ts:85-126). The repo contains no workflow that receives it (§4.3). |
| 4 | "**Frontend (Mobil & Keresztplatform)** … React Native + Expo (A gyors cross-platform fejlesztésért …)" (conductor/tech-stack.md:3-4) | This is only partly true. The configured platforms are **Android and web only** (app.json:9-12); iOS is not a target. Ads are Android-only (src/components/AdBanner.tsx:16). The iOS RevenueCat branch exists (src/context/BillingContext.tsx:68) but is not built. |
| 5 | "**Backend & Adatbázis (BaaS)** … Supabase … PostgreSQL" (conductor/tech-stack.md:9-11) presented as the whole backend, with n8n as the only "external background service" (conductor/tech-stack.md:15) | Most backend logic runs in **13 Deno Edge Functions** under `supabase/functions/` (§3). They call Gemini (§4.4) and EU VIES (supabase/functions/vies-check/index.ts:20). Schema changes rely on `pgvector` (supabase/migrations/20260618102838_init_rag_grants.sql:2) and `pg_cron`/`pg_net`. The document mentions none of these; they are omissions rather than direct contradictions. |

Statements the code **confirms**:

| Claim | Evidence |
|---|---|
| React Native + Expo | package.json:14, package.json:26 |
| TypeScript | package.json:54 |
| React Native Paper with MD3 | package.json:28, App.tsx:4, App.tsx:36-43 |
| `@react-navigation/native-stack` | package.json:11, App.tsx:3, App.tsx:34 |
| Supabase Auth | App.tsx:61-66, src/screens/AuthScreen.tsx:44 |
| RLS | §2.2 |
| Node.js scripts exist | the `scripts/` directory |

**Unverifiable from code:** whether any n8n instance or workflow is actually running.

---

## 6. Observations found while mapping (not fixed here)

These came up while tracing the code above. This PR changes nothing. They are listed so that
owners can triage them separately.

> **Status 2026-09-26:** items 1, 2 and 3 were confirmed on the live database and **FIXED**:
> PR #194 (77c16c6: `profiles` UPDATE limited to the app-edited columns, `consume_daily_search`
> and `match_grant_chunks` executable by `service_role` only, `chat-with-gemini` writes only
> to the caller's own plans) and PR #195 (e6550bf: new `public` functions no longer get
> EXECUTE for PUBLIC/anon/authenticated by default). The text below describes the state
> **before** those fixes.

1. **The `profiles` UPDATE policy has no column restriction.**
   - The policy has no `WITH CHECK` and restricts no columns
     (supabase/migrations/20260822090000_security_and_performance_hardening.sql:25-27).
   - As written in the repo, an authenticated user could therefore update their own
     `subscription_tier` and daily counters directly with the anon key.
   - The server-side Pro gate and daily cap read exactly those columns
     (supabase/functions/_shared/entitlement.ts:16-24,
     supabase/migrations/20260912150000_daily_search_cap.sql:26-47).
2. **`consume_daily_search` has no REVOKE or GRANT.**
   - It is SECURITY DEFINER, takes an arbitrary `p_user`
     (supabase/migrations/20260912150000_daily_search_cap.sql:15-20), and has no
     `REVOKE`/`GRANT` in the migration.
   - It may therefore be callable over `/rest/v1/rpc` by anon or authenticated users against
     any user id.
3. **`chat-with-gemini` writes with the service role on IDs it does not verify.**
   - It updates `action_tasks` using IDs returned by the model
     (supabase/functions/chat-with-gemini/index.ts:416-419).
   - It reads a `grant_matches` row by `match_id` without an ownership check
     (supabase/functions/chat-with-gemini/index.ts:130-134).
   - It skips the ownership check when the profile is not found
     (supabase/functions/chat-with-gemini/index.ts:108), but still updates by that id
     (supabase/functions/chat-with-gemini/index.ts:392-395).
4. **The inline Home banner always uses Google's test ad unit**
   (src/screens/HomeScreen.tsx:56).
5. **The schema cannot be rebuilt from the repo alone** (§2.2). The migrations also reference
   objects that exist in neither SQL source:
   - the `rls_auto_enable()` function
     (supabase/migrations/20260822090000_security_and_performance_hardening.sql:40)
   - a "Public profiles are viewable by everyone." policy
     (supabase/migrations/20260822090000_security_and_performance_hardening.sql:12)
6. **The CopilotChat screen is unreachable** from the UI (§1.2).
7. **`scripts/deploy-n8n-workflow.js` falls back to the anon key** as the n8n→Supabase
   secret when `N8N_WEBHOOK_SECRET` is unset (scripts/deploy-n8n-workflow.js:49).
   `ingest-n8n-grants` would then reject requests unless the two values match
   (supabase/functions/ingest-n8n-grants/index.ts:39-58).
