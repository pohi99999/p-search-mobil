# Track: Hibakeresés, ikon javítások és Supabase Auth Bypass (S25 Ultra diagnosztika)

Ez a track a Samsung Galaxy S25 Ultra natív összeomlási problémájára, a hiányzó ikonok javítására és a Supabase bejelentkezési elakadások megkerülésére (bypass) fókuszált.

## Feladatok & Státusz

- [x] **EAS Build profil (`development-client`):** 
  - Beállítottuk a `development-client` profilt a `eas.json` fájlban, ami egy natív hibakonzollal ellátott fejlesztői verziót buildel.
  - Ellenőriztük a `@expo/vector-icons` és az `expo-dev-client` függőségek meglétét.
- [x] **Hiányzó ikonok javítása az Auth felületen:** 
  - A `src/screens/AuthScreen.tsx` fájlban a korábbi szöveges TextInput ikonokat lecseréltük explicit `@expo/vector-icons` `MaterialCommunityIcons` komponensekre, amik garantáltan kirajzolódnak Android 15+ eszközökön is (megoldva a hiányzó ikonok/téglalapok problémáját).
- [x] **Supabase Auth & DB Bypass (Proxy):** 
  - A `src/lib/supabase.ts` fájlban implementáltunk egy transzparens Proxy wrappert, ami fejlesztői környezetben (`__DEV__`) és aktív `BYPASS_AUTH` flag mellett automatikusan mockolja a Supabase Auth és a legfontosabb táblák (`profiles`, `business_profiles`, `grant_matches`, `action_plans`, `action_tasks`) lekérdezéseit.
  - Ezzel az alkalmazás azonnal bypass-olja a bejelentkező felületet, kiküszöböli a Supabase RLS korlátokat és az elakadt e-mail megerősítést, felgyorsítva a belső tesztelést.
- [x] **AsyncStorage natív autolink korrekció:**
  - Az indításkori `AsyncStorage is null` hiba elhárítására visszaállítottuk a kompatibilis `@react-native-async-storage/async-storage` `2.2.0` verziót.
- [x] **HomeScreen navigációs bekötések:**
  - Felvettük a hiányzó `ActionPlanScreen`-t és `CopilotChatScreen`-t a Stack.Navigator-ba az [App.tsx](file:///Z:/001_Workspace/p-search%20mobil/App.tsx) fájlban, a HomeScreen kártyáinak "Részletek" gombját pedig a navigációhoz kapcsoltuk.
- [x] **PRO státusz bypass és közvetlen chat indítás:**
  - A belső teszteléshez a [BillingContext.tsx](file:///Z:/001_Workspace/p-search%20mobil/src/context/BillingContext.tsx) fájlban fejlesztési módban fixen PRO státuszt biztosítottunk, és a HomeScreen "Új AI Keresés" gombját a Paywall helyett közvetlenül a Copilot chat képernyőre irányítottuk át.
- [x] **`chat-with-gemini` Edge Function fejlesztések:**
  - Integráltuk a hivatalos `@google/generative-ai` SDK-t (kivezetve a REST hívást).
  - CORS támogatást adtunk preflight OPTIONS lekérésekhez 200-as visszatéréssel.
  - Biztonságos JSON paraméter-kinyerést, try-catch hibakezelést és részletes szerveroldali logolást adtunk hozzá.
  - Frissítettük a modellt az új `gemini-2.5-flash` verzióra a v1beta API végponton a kivezetési 404-es hibák elhárítására.
  - Kivettük a funkciót a helyi bypass mock alól, hogy az éles hálózati kérés menjen ki.

## Diagnosztikai parancsok

- **Fejlesztői build futtatása:** `eas build --profile development-client --platform android`
- **Metro indítása klienssel:** `npx expo start --dev-client`
- **Natív crash logok kinyerése USB-n:** `adb logcat AndroidRuntime:E *:S`
- **Supabase Edge Function helyi tesztelése:** `supabase functions serve`
