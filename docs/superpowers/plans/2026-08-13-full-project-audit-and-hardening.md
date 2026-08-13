# P-Search Mobil — Teljes Projekt Audit, Tesztlefedettség-pótlás és Hardening Implementációs Terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A P-Search Mobil (React Native + Expo SDK ~56, Supabase backend) repo teljes körű auditja: hiányzó fejlesztői infrastruktúra pótlása (lint/format/CI/env), teszt lefedettségi rések betömése (elsősorban a Supabase Edge Function réteg), funkcionális ellenőrzés éles futtatással, biztonságos refaktor/config-javítások, 1-2 konkrét prémium fejlesztés megvalósítása, majd dokumentálás és a `master` ágra való push.

**Architecture:** Meglévő, működő kódbázisra épülő inkrementális hardening. Minden fázis önálló, saját teszt-ciklussal rendelkező egység (a `feature/full-project-audit` branch-en), a végén egy fast-forward merge kerül a `master`-be. Nincs architektúra-váltás — a cél a meglévő minták (TS strict, funkcionális komponensek, Jest, Supabase Edge Functions/Deno) követése és megerősítése.

**Tech Stack:** TypeScript (strict), React Native 0.85 / Expo SDK ~56, Jest + `jest-expo` + `@testing-library/react-native`, Supabase (Postgres/RLS/Edge Functions, Deno runtime), ESLint + Prettier (újonnan bevezetve), GitHub Actions (újonnan bevezetve).

**Spec:** A felhasználó Magyar nyelvű kérése (teljes projekt feltérképezés, teszt lefedettség biztosítása minden funkcióra, funkció-ellenőrzés, refaktor javaslatok végrehajtása, kipróbálás, beállítás-ellenőrzés, GitHub push a main ágra, prémium fejlesztési javaslatok megvalósítása, dokumentáció frissítés, záró összefoglaló) + a felderítő ügynök jelentése (ld. session log). Domain-spec: `Z:\001_Workspace\p-search mobil\spec.md`, `.github/copilot-instructions.md`.

## Global Constraints

- TypeScript **strict mode** kötelező, `any` típus tilos indoklás nélkül (`.github/copilot-instructions.md`).
- Csak funkcionális React komponensek, `StyleSheet.create` (nincs inline style), class komponens tilos.
- Titkos kulcs / API kulcs soha nem kerülhet commitba.
- RLS nélküli Supabase tábla tilos.
- Minden meglévő teszt (jelenlegi baseline: 21 suite, ~135 teszt) zöld kell maradjon minden fázis végén — regresszió tilos.
- `npx tsc --noEmit` 0 hibával kell lefusson minden fázis végén.
- Git: soha nem force-push, soha nem `--no-verify`. Csak akkor merge/push a `master`-be, ha az adott fázis teszt+típus-ellenőrzése zöld.
- Nem commitolható: `.env`, `google-service-account.json`, `play-console-api-*.json`, `application-*.aab` (ezek már `.gitignore`-ban vannak — ellenőrizni, nem bővíteni scope-ot rájuk).

---

### Task 0: Feature branch létrehozása

**Files:** nincs fájlváltozás, csak git állapot.

- [ ] **Step 1:** `git checkout -b feature/full-project-audit-hardening` a tiszta `master`-ből.
- [ ] **Step 2:** `git status` ellenőrzés — tiszta munkakönyvtár.

---

### Task 1: Fejlesztői infrastruktúra — ESLint + Prettier + package.json javítás + `.env.example`

**Files:**
- Create: `.eslintrc.json`
- Create: `.prettierrc.json`
- Create: `.eslintignore` (vagy `eslint.config` esetén `ignorePatterns`)
- Create: `.env.example`
- Modify: `package.json` (name mező, scripts blokk, új devDependencies: `eslint`, `eslint-config-expo` vagy `@react-native/eslint-config`, `prettier`)

**Interfaces:**
- Produces: `npm run lint`, `npm run format`, `npm run test`, `npm run typecheck` parancsok, amiket a Task 1 CI workflow és minden további fázis felhasznál.

- [ ] **Step 1: `.eslintrc.json` létrehozása** (Expo hivatalos preset, ami React Native + TS szabályokat is hoz):

```json
{
  "extends": ["expo", "eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "env": { "jest": true },
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  },
  "ignorePatterns": ["dist/", "node_modules/", ".expo/", "supabase/functions/**"]
}
```

(A `supabase/functions/**` ki van zárva, mert Deno runtime — külön lintelést kap, ha a csapat úgy dönt; ez konzisztens a `tsconfig.json` meglévő `exclude`-jával.)

- [ ] **Step 2: `.prettierrc.json` létrehozása:**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: devDependencies telepítése:**

```bash
npm install --save-dev eslint eslint-config-expo @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

- [ ] **Step 4: `package.json` `scripts` blokk bővítése és `name` mező javítása:**

```json
"name": "p-search-mobil",
```

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "typecheck": "tsc --noEmit",
  "lint": "eslint . --ext .ts,.tsx",
  "format": "prettier --write \"src/**/*.{ts,tsx}\"",
  "format:check": "prettier --check \"src/**/*.{ts,tsx}\"",
  "test": "jest",
  "test:coverage": "jest --coverage"
}
```

- [ ] **Step 5: Lint futtatása és a jelentkező hibák kijavítása** (nem elnyomása):

```bash
npm run lint
```

Minden jelentkező hibát (várhatóan `no-explicit-any` és `no-unused-vars` találatok) ténylegesen javítani kell a forrásfájlokban, nem `// eslint-disable` sorral elnyomni — kivéve, ha a Global Constraints szerinti indokolt `any` esetről van szó, amit inline kommenttel meg kell indokolni.

- [ ] **Step 6: `.env.example` létrehozása** a ténylegesen használt (Task felderítésből ismert) kulcsokkal, valós értékek nélkül:

```bash
# Supabase kliens kapcsolat
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# RevenueCat (in-app purchase)
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=

# Google AdMob (production unit ID-k; fejlesztéskor teszt ID-kra esik vissza, ha üres)
EXPO_PUBLIC_INTERSTITIAL_AD_UNIT_ID=
EXPO_PUBLIC_BANNER_AD_UNIT_ID=

# n8n integráció
EXPO_PUBLIC_N8N_WEBHOOK_URL=

# --- Supabase Edge Function szerveroldali secrets (supabase secrets set-tel állítandó, NEM ide) ---
# SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET, ALLOWED_ORIGIN, GEMINI_API_KEY
```

- [ ] **Step 7: Ellenőrzés — `npm run typecheck` és `npm test` továbbra is 0 hibával / zölden fusson.**

- [ ] **Step 8: Commit:**

```bash
git add .eslintrc.json .prettierrc.json .env.example package.json package-lock.json
git commit -m "chore: add ESLint/Prettier, fix package.json name, add npm scripts and .env.example"
```

---

### Task 2: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 1 `npm run typecheck`, `npm run lint`, `npm test` scriptjei.

- [ ] **Step 1: `.github/workflows/ci.yml` létrehozása:**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --ci
```

- [ ] **Step 2: YAML szintaxis ellenőrzés** (`yamllint` ha elérhető, vagy `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` mint gyors szintaxis-check).

- [ ] **Step 3: Commit:**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for typecheck, lint and tests"
```

---

### Task 3: Teszt lefedettség audit és pótlás — Supabase Edge Functions

**Files:**
- Read/audit: mind a 21 meglévő teszt fájl (`src/**/*.test.ts(x)`, `__tests__/screens/ActionPlanScreen.test.tsx`) + `npm run test:coverage` kimenete.
- Create: `supabase/functions/increment-search-count/index.test.ts` (Deno test, a biztonsági javítás Edge Function-je)
- Create: `supabase/functions/trigger-n8n-webhook/index.test.ts` (Deno test, a másik biztonsági javítás Edge Function-je)
- Create (ha a coverage report rést mutat): további `*.test.ts(x)` fájlok a feltárt rések mellé, közvetlenül az érintett forrásfájl mellett.

**Interfaces:**
- Consumes: a két Edge Function jelenlegi `index.ts` implementációja (auth header ellenőrzés, ownership check, Supabase kliens hívások) — pontos szignatúrákat a fájlok elolvasása után kell rögzíteni, mivel az Explore jelentés csak a létüket, nem a pontos exportjaikat írta le.

- [ ] **Step 1: `npm run test:coverage` futtatása, a `coverage/lcov-report` vagy terminál-összegzés áttekintése.** Azonosítani minden `src/` fájlt, aminek coverage-e a "rendes" átlag alatt van (pl. <70% branch coverage), és minden olyan üzleti logikát tartalmazó fájlt, aminek egyáltalán nincs `*.test.ts(x)` párja.

- [ ] **Step 2: A két Edge Function (`supabase/functions/increment-search-count/index.ts` és `supabase/functions/trigger-n8n-webhook/index.ts`) elolvasása**, hogy pontosan lássuk a request/response szerződést, az auth-ellenőrzés és az ownership-ellenőrzés logikáját (ezek a legutóbbi két biztonsági javítás tárgyai — ezeknek kritikusan fontos, hogy legyen regressziós tesztjük).

- [ ] **Step 3: Deno teszt írása `increment-search-count`-hoz**, ami lefedi: (a) hiányzó/érvénytelen Bearer token → 401, (b) érvényes token, de a user nem a saját `search_count`-ját próbálja növelni → 403 (ownership check), (c) érvényes, jogosult kérés → sikeres válasz és a számláló inkrementálása. A konkrét mock-stratégia (Supabase kliens mockolása) a Step 2-ben megismert implementációtól függ — kövesse a Deno `Deno.test()` mintát, `std/testing/asserts.ts` használatával, konzisztensen a Deno Edge Function ökoszisztémával.

- [ ] **Step 4: Deno teszt írása `trigger-n8n-webhook`-hoz**, ami lefedi: (a) auth nélküli kérés elutasítása, (b) más felhasználó grant-mátch-ének triggerelési kísérlete → elutasítás (ez volt a `ff5233d` javítás lényege), (c) jogosult, sikeres trigger → n8n webhook hívás megtörténik (mockolt fetch-csel).

- [ ] **Step 5: A Step 1-ben azonosított egyéb rések pótlása** — minden új teszt a TDD ciklust követi: előbb failing teszt, majd a tényleges (már működő) viselkedést igazoló assertion, run, zöld. (Itt nem hiányzó implementációt tesztelünk be újonnan, hanem meglévő, működő kódot fedünk le regresszió ellen — a teszt így induláskor is zöld lehet, ha a kód helyes; ha a teszt közben hibát talál a meglévő kódban, az bug, amit a Task 5 (refaktor) fázisban vagy azonnal, jegyzett kivétellel kell kezelni.)

- [ ] **Step 6: `npx jest` és (ha van Deno lokálisan) `deno test supabase/functions/` futtatása — minden zöld.**

- [ ] **Step 7: Commit:**

```bash
git add supabase/functions/**/*.test.ts src/**/*.test.ts src/**/*.test.tsx
git commit -m "test: add coverage for Edge Function security paths and identified gaps"
```

---

### Task 4: Funkcionális ellenőrzés — app kipróbálása és beállítás-audit

**Files:** nincs kódváltozás ebben a taskban (csak jegyzőkönyv/lelet, amit a Task 5/6 hasznosít).

- [ ] **Step 1:** `npx tsc --noEmit` — baseline igazolás, 0 hiba.
- [ ] **Step 2:** `npx jest` — baseline igazolás, minden meglévő + Task 3-ban hozzáadott teszt zöld.
- [ ] **Step 3:** `npx expo export -p web` (vagy `npm run web` háttérben) — az app webes buildje elindul-e hiba nélkül.
- [ ] **Step 4:** Böngészőben (Chrome DevTools MCP vagy claude-in-chrome) megnyitni a futó dev szervert, és manuálisan végigmenni a fő user flow-n: Auth képernyő megjelenik session nélkül → (mock/teszt bejelentkezés, ha van) → Home lista renderelése → Onboarding flow triggerelése, ha nincs business profile → Paywall modal megnyitása → ActionPlan képernyő navigáció. Minden konzol hibát (`read_console_messages`) rögzíteni.
- [ ] **Step 5:** Beállítás-ellenőrzés: `app.json`, `eas.json`, `supabase/config.toml` átnézése — konkrétan ellenőrizni, hogy a bundle ID, az Android SDK verziók, az EAS build profilok konzisztensek-e egymással és a `package.json` verziószámmal.
- [ ] **Step 6: Élő Supabase dashboard audit** (`https://supabase.com/dashboard/project/icextvgecinmhrhjtfcm`, böngésző-automatizálással megnyitva): ellenőrizni — (a) Auth beállítások (engedélyezett providerek, email confirm szükséges-e, redirect URL-ek), (b) Database → Table Editor: minden táblán van-e RLS bekapcsolva (a Global Constraints tiltja az RLS nélküli táblát — ez itt élesben ellenőrizhető, nem csak a migrációs SQL-ből), (c) Edge Functions lista és legutóbbi deploy/hiba-log a 7 függvényre, (d) Database → Extensions: `pgvector` telepítve-e a RAG funkcióhoz, (e) Project Settings → API: kulcsok megegyeznek-e a helyi `.env`-ben szereplőkkel (csak a kulcs *jelenlétét/típusát* ellenőrizni, az anon/service_role kulcs értékét NEM kiírni sehova), (f) Edge Function Secrets lista: megvan-e mind a 7, amit `src/config/env.ts` és az Edge Function kód elvár (`GEMINI_API_KEY`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `ALLOWED_ORIGIN`, stb.) — csak a kulcsnevek meglétét, nem az értéküket. Ez egy élő, megosztott rendszer — **csak olvasás/audit történik itt**, tényleges módosítás (RLS policy, auth config, secret érték) csak Task 5-ben, jóváhagyás után történhet, még akkor is, ha a felhasználó előre felhatalmazást adott, mert ez biztonság-érzékeny, a worktree-n kívüli, megosztott rendszert érintő beavatkozás.
- [ ] **Step 7: Élő Expo (EAS) dashboard audit** (`https://expo.dev/accounts/pohi9999`, böngésző-automatizálással megnyitva): ellenőrizni — (a) a projekt (`p-search`) létezik-e és a `app.json`/`eas.json` bundle ID / slug egyezik-e a dashboardon látottal, (b) Credentials: van-e Android keystore/signing credential regisztrálva a `production` submit profilhoz, (c) legutóbbi EAS Build-ek státusza (sikeres/hibás, melyik profillal), (d) legutóbbi EAS Submit kísérletek státusza (Google Play internal track felé, `eas.json` szerint), (e) Project Settings: van-e olyan owner/collaborator vagy webhook beállítás, ami eltér a vártól. Csak olvasás/audit — signing credential, submit konfiguráció vagy build-profil módosítása biztonság-érzékeny és visszafordíthatatlan (rossz keystore = a store-ban élő app frissíthetetlenné válhat), ezért ilyen javaslat csak jóváhagyás után kerül végrehajtásra, ugyanúgy, mint a Supabase-nél. Kozmetikai/dokumentációs eltérés (pl. leírás-mező hiányzik) egyből javítható.
- [ ] **Step 8:** A talált éles hibákat (repó, Supabase dashboard, Expo/EAS dashboard) azonnal jegyzőkönyvezni — ezek külön Task-ká válnak a Task 5 (refaktor) fázisban. A biztonság-érzékeny javítási javaslatokat (hiányzó RLS, hiányzó secret, credential/submit-konfiguráció) a Task 5 dispatch-ban külön, jóváhagyásra megjelölve kell felsorolni, nem automatikusan végrehajtva.

---

### Task 5: Refaktor és konfigurációs javítások (alacsony kockázatú)

**Files:**
- Modify: `package.json` (`jest-expo` verzió `^52.0.6` → az Expo SDK 56-tal kompatibilis verzióra emelése)
- Modify: `tsconfig.json` (csak ha a Task 4 auditból indokolt változtatás derül ki)
- Modify/Create: `README.md` a gyökérben (jelenleg nincs — rövid, tényalapú projekt-leírás a `spec.md` és a copilot-instructions.md alapján, telepítési/futtatási utasításokkal)
- A Task 4-ben feltárt konkrét hibák javítása (fájlonként, a feltárás után pontosítva)

**Interfaces:**
- Consumes: Task 4 audit-jegyzőkönyv (feltárt hibák/inkonzisztenciák listája).

- [ ] **Step 1: `jest-expo` verzió frissítése** az Expo SDK 56-tal kompatibilis release-re:

```bash
npm install --save-dev jest-expo@~56
```

- [ ] **Step 2:** `npx jest` futtatása a frissítés után — ha bármi eltör, a root cause-t kell megkeresni és javítani (nem verzió-visszaállítással megkerülni), a superpowers:systematic-debugging skill szerint.

- [ ] **Step 3: Gyökér `README.md` létrehozása** — rövid projekt-összefoglaló (mi ez, tech stack, hogyan indítsd lokálisan: `npm install`, `.env.example` → `.env` másolása és kitöltése, `npm start`), hivatkozással a `spec.md`-re és a `conductor/`-ra részletekért. Nem duplikálja a `copilot-instructions.md` tartalmát, csak belépési pontként szolgál.

- [ ] **Step 4: A Task 4-ben azonosított konkrét hibák javítása** — minden javításhoz: előbb reprodukáló teszt (ha alkalmazható), majd a javítás, majd zöld teszt.

- [ ] **Step 5:** `npx tsc --noEmit` és `npx jest` — 0 hiba, minden teszt zöld.

- [ ] **Step 6: Commit:**

```bash
git add package.json package-lock.json README.md
git commit -m "fix: align jest-expo with Expo SDK 56, add root README"
```

(Ha a Step 4-ben további fájlok módosultak, azok külön, logikus bontású commitokba kerülnek.)

---

### Task 6: Prémium fejlesztési javaslat kidolgozása és megvalósítása

**Files:** a brainstorming kimenetétől függ — konkrét fájllista a Step 1 után rögzítendő.

**Interfaces:**
- Consumes: `src/types/database.ts` meglévő adatmodell (`BusinessProfile`, `Grant`, `GrantMatch`, `ActionPlan`, `ActionTask`), meglévő screen-ek és hook-ok mintái.

- [ ] **Step 1:** A superpowers:brainstorming skill meghívása, hogy 2-3 konkrét, kis hatókörű, a meglévő architektúrába illeszkedő prémium-fejlesztési ötletet dolgozzunk ki (pl.: Pro-felhasználóknak "Match Score" trend-előzmény, ActionTask határidő-emlékeztető push notification, vagy CopilotChat üzenet-előzmény perzisztálása). A skill kimenete pontosítja ennek a Tasknak a lépéseit — ez a lépés maga a "spec-írás" erre a részfeladatra.
- [ ] **Step 2:** A kiválasztott 1 funkcióra a superpowers:test-driven-development skill szerint: failing teszt → minimális implementáció → zöld teszt, ciklikusan.
- [ ] **Step 3:** `npx tsc --noEmit` és `npx jest` — 0 hiba, minden teszt zöld (beleértve az újakat is).
- [ ] **Step 4: Commit** (a brainstorming után pontosítandó, konvenció szerinti `feat:` prefixű üzenettel).

---

### Task 7: Dokumentáció frissítése

**Files:**
- Modify: `GEMINI.md` (fejlesztési napló — új, dátumozott bejegyzés a session végén)
- Modify: `status.log`
- Modify: `conductor/tracks.md` — **csak olvasásra**, mivel a projekt szabálya szerint ("Do not manually edit conductor/tracks.md") ezt nem szabad kézzel szerkeszteni; ha frissítés szükséges, azt jegyzőkönyvezni kell a `GEMINI.md`-ben, és jelezni a felhasználónak, hogy a Conductor-folyamat ezt automatikusan kezeli.

- [ ] **Step 1:** `GEMINI.md` végére új, `2026-08-13` dátumozott bejegyzés a session teljes eredményéről (mi történt: lint/CI bevezetés, teszt-pótlás, refaktor, új funkció, futtatási eredmények), a meglévő napló-formátumot követve.
- [ ] **Step 2:** `status.log` frissítése a legutóbbi `tsc`/`jest` futtatási eredménnyel (mintázat: a fájl jelenlegi formátumát követve).
- [ ] **Step 3:** Commit:

```bash
git add GEMINI.md status.log
git commit -m "docs: log full-project audit and hardening session progress"
```

---

### Task 8: Merge és push a `master` ágra

**Files:** nincs.

- [ ] **Step 1:** `npx tsc --noEmit` és `npx jest` végső, teljes futtatása a feature branch HEAD-jén — mindkettő hibátlan/zöld kell legyen.
- [ ] **Step 2:** `git checkout master && git pull --ff-only origin master` — friss `master` állapot.
- [ ] **Step 3:** `git merge --no-ff feature/full-project-audit-hardening -m "merge: full project audit, test hardening, CI and premium feature"` (a `--no-ff` megőrzi a fázisok commit-történetét olvashatóan).
- [ ] **Step 4:** `npx tsc --noEmit` és `npx jest` **még egyszer**, a mergelt `master`-en — regresszió-ellenőrzés.
- [ ] **Step 5:** `git push origin master`.

---

### Task 9: Záró összefoglaló

**Files:** nincs — csak a felhasználónak szóló válasz.

- [ ] **Step 1:** Összefoglalni magyarul: mi történt (fázisonként), milyen leletek/hibák kerültek elő és lettek javítva, mi az új prémium funkció, mik a fennmaradó ismert korlátok (pl. nincs E2E teszt, nincsenek production RevenueCat/AdMob kulcsok), és milyen konkrét következő lépéseket javaslunk.

---

## Self-Review Notes

- **Spec coverage:** minden felhasználói kérés-elem (feltérképezés → Task 4 audit előkészítő rész az Explore ügynökön keresztül már megtörtént; teszt lefedettség → Task 3; funkció-ellenőrzés/kipróbálás → Task 4; refaktor → Task 5; GitHub push a main-be → Task 8; prémium fejlesztés → Task 6; dokumentáció → Task 7; záró összefoglaló → Task 9) egy-egy taskra van leképezve.
- **Placeholder scan:** a Task 3 és Task 6 néhány lépése szándékosan a végrehajtás közben pontosítandó (Edge Function pontos szerződése, brainstorming kimenete) — ez nem placeholder, hanem olyan információ, ami csak a megelőző lépés (fájlolvasás, ill. brainstorming) után derül ki; minden más lépés konkrét, futtatható tartalommal rendelkezik.
- **Type consistency:** a script-nevek (`typecheck`, `lint`, `test`, `test:coverage`) konzisztensen ugyanazok Task 1 bevezetésétől kezdve minden további task hivatkozásában.
