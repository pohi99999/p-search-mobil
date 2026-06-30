# P-Search Mobil — Copilot Instructions (Belső Szabálykönyv)

> **Ez a fájl a projekt AI asszisztensének kötelező iránymutatója.**  
> Minden Copilot / AI interakciónak ezeket az elveket kell követnie.

---

## 1. Projekt Vízió (Product Vision)

**P-Search Mobil** egy AI-alapú Digitális Pályázatíró és Hitelügyintéző Ügynök magyar KKV-k számára.

### Fő Funkcionális Területek
- **Master Document Base (MDB):** Felhasználók feltöltik pénzügyi kimutatásaikat (mérleg, főkönyv) Gemini OCR segítségével. A rendszer strukturálja és tárolja ezeket a Supabase-ben.
- **Hibrid Szemantikus/Matematikai Szűrő:** A feltöltött cégadatok alapján az AI kiszűri a releváns pályázatokat és hiteleket (RAG + pgvector).
- **Automatikus Dokumentumgenerálás:** Előre kitöltött PDF/docx fájlok generálása a cég adataival (pályázati űrlapok, üzleti tervek).
- **AI Copilot Chat:** Gemini-2.5-flash alapú szakértői chat asszisztens pályázati kérdésekhez.

---

## 2. Technológiai Stack (Kötelező)

### Frontend
- **Framework:** React Native **Expo SDK 56** (platform-agnostikus: Android, iOS, Web)
- **UI Library:** `react-native-paper` (Material Design 3) — Letisztult "Glass Box" stílus, wow-élmény
- **Navigáció:** `@react-navigation/native` + `@react-navigation/stack`
- **State:** React Context API (`BillingContext`, `AuthContext`)
- **AsyncStorage:** `@react-native-async-storage/async-storage` **v2.2.0** (Expo SDK 56 kompatibilis — NE frissítsd v3-ra!)

### Backend & Adatbázis
- **BaaS:** Supabase (Auth, PostgreSQL, RLS, Edge Functions, Storage)
- **Edge Functions:** Deno runtime, TypeScript
- **Vektor Adatbázis:** pgvector extension, **768 dimenziós** vektorok
- **Embedding Modell:** `gemini-embedding-001` outputDimensionality: **768** (v1beta API végpont)
- **Chat/AI Modell:** `gemini-2.5-flash` (v1beta API végpont)

### AI & Integrációk
- **Google Gemini API:** `@google/generative-ai` SDK
- **Monetizáció:** `react-native-purchases` (RevenueCat IAP)
- **Reklámok:** `react-native-google-mobile-ads` (AdMob)
- **Automatizálás:** n8n workflow-ok pályázatok begyűjtéséhez és ingest-hez
- **Build:** Expo EAS Build & Submit

### Biztonság
- Supabase Row Level Security (RLS) minden táblán
- Edge Function-ökben `SUPABASE_SERVICE_ROLE_KEY` a belső DB műveletek bypass-olásához
- `__DEV__` módban auth bypass (fejlesztési célra), productionban ki van kapcsolva

---

## 3. Architektúrális Szabályok

### 3.1 Kötelező Konvenciók
- **TypeScript Strict Mode:** Minden fájlban kötelező. `any` típus TILOS (csak indokolt esetben, kommenttel).
- **Típusellenőrzés:** Minden commit előtt `npx tsc --noEmit` sikeresen kell fusson.
- **Komponensek:** Funkcionális komponensek React hookokkal. Class componentek TILOSAK.
- **Stílusok:** `StyleSheet.create()` vagy `react-native-paper` `theme` — inline stílusok kerülendők.
- **Platform-specifikus kód:** `Platform.OS` ellenőrzés vagy `.ios.tsx` / `.android.tsx` / `.web.tsx` suffixek.

### 3.2 Supabase Edge Functions
- Runtime: **Deno** (TypeScript)
- CORS: Minden function-ben kötelező `OPTIONS` preflight kezelés 200-as visszatéréssel
- Auth: `Authorization: Bearer <token>` fejléc ellenőrzése
- Hibakezelés: Minden endpoint-on strukturált JSON hibaválasz

### 3.3 RAG & Embedding
- Embedding modell: `gemini-embedding-001` a `v1beta` API-n
- Dimenzió: **768** (kötelező `outputDimensionality: 768` paraméter)
- HNSW index a `grant_chunks` táblán (gyors szemantikus keresés)
- Match függvény: `match_grant_chunks` RPC

### 3.4 Navigáció Típusozás
```typescript
// Kötelező navigációs típusok (App.tsx-ben definiálva)
type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  Home: undefined;
  ActionPlan: { matchId: string; grantTitle: string };
  CopilotChat: { grantTitle?: string; context?: string };
  Paywall: undefined;
};
```

---

## 4. Conductor Framework (KÖTELEZŐ)

Ez a projekt **Szigorúan Conductor Üzemmódban** működik.

- **Tracks:** `conductor/tracks/` mappában lévő track-ek és `conductor/workflow.md` alapján
- **Minden fejlesztés előtt:** Ellenőrizd a `conductor/tracks.md` aktív track-eit!
- **Git Notes:** Minden commit-hoz kötelező Conductor-kompatibilis git note
- **Státuszjelentések:** Fejlesztési mérföldkövek után állapotjelentés szükséges

---

## 5. EAS Build Konfiguráció

### Build Profilok
| Profil | Platform | Típus | Terjesztés |
|--------|----------|-------|-----------|
| `development` | Android + iOS | Dev Client | Internal |
| `development-client` | Android + iOS | Dev Client | Internal |
| `preview` | Android | APK | Internal |
| `production` | Android + iOS | Release | Store |

### Fontos Verzió-Kompatibilitások
- Compile SDK: **36** (Android 15+)
- Target SDK: **35**
- AdMob android_app_id: gyökérszintű `react-native-google-mobile-ads` kulcs
- `expo-build-properties` plugin: `compileSdkVersion: 36`, `targetSdkVersion: 35`

---

## 6. UI/UX Irányelvek ("Glass Box" Stílus)

- **Elsődleges szín:** `#1976D2` (Material Blue 700)
- **Háttér:** Fehér/világos szürke, kártyás elrendezés
- **Kártyák:** `react-native-paper` `Card` komponens, `elevation: 2-4`
- **Gombok:** `react-native-paper` `Button` (`mode="contained"` vagy `"outlined"`)
- **Ikonok:** `MaterialCommunityIcons` (explicit import, ne `@expo/vector-icons` általános icon)
- **Animációk:** Kíméletes, 200-300ms transitions
- **Akadálymentesség:** `accessibilityLabel` minden interaktív elemen

---

## 7. Zero-Budget Stratégia

- Csak ingyenes, nyílt forráskódú eszközök (professzionális enterprise köntösben)
- Supabase Free tier (Edge Functions, 500MB DB, 50MB Storage)
- Google Gemini API ingyenes kvóta
- AdMob bevétel a premium funkciók finanszírozásához
- RevenueCat free tier (10k MAU-ig)

---

## 8. Tiltott Műveletek (TILOS)

- ❌ `@types/react-native` csomag telepítése (ütközik az Expo SDK típusaival)
- ❌ `@react-native-async-storage/async-storage` v3+ (Expo SDK 56 nem kompatibilis)
- ❌ `any` típus indoklás nélkül
- ❌ Class komponensek
- ❌ Inline stílusok (teljesítmény)
- ❌ Titkos kulcsok (API keys, tokens) forráskódba commitolni
- ❌ RLS nélküli Supabase tábla létrehozása

---

## 9. Fejlesztési Workflow

```bash
# Fejlesztési szerver indítása
npx expo start

# Web preview
npx expo start --web

# Típusellenőrzés (commit előtt kötelező)
npx tsc --noEmit

# Tesztek futtatása
npx jest

# EAS build (Android dev)
eas build --platform android --profile development

# EAS build (Android production)
eas build --platform android --profile production

# Supabase Edge Functions deploy
npx supabase functions deploy <function-name>
```

---

## 10. Aktív Fázisok Összefoglalója

| Fázis | Státusz | Leírás |
|-------|---------|--------|
| Fázis 1 | ✅ Kész | Auth, Onboarding, Alapstruktúra |
| Fázis 2 | ✅ Kész | RAG Adatbázis, pgvector, grant_chunks |
| Fázis 3 | ✅ Kész | AI Copilot Chat (Gemini + RAG) |
| Fázis 4 | ✅ Kész | Action Plan generálás, n8n integráció |
| Fázis 5 | 🔄 Aktív | Production & Multi-platform Deployment |

**Fázis 5 — Production & Multi-platform Deployment céljai:**
- EAS Build konfiguráció (Android + iOS + Web)
- Master Document Base (OCR, pénzügyi feltöltés)
- Hibrid pályázatszűrő (matematikai kritériumok)
- Automatikus dokumentumgenerálás (PDF/docx)
- CI/CD pipeline GitHub Actions-szel

---

*Utolsó frissítés: 2026-06-30 | Conductor Framework v1.0*
