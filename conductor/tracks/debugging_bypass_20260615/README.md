# Track: Hibakeresés, ikon javítások és Supabase Auth Bypass (S25 Ultra diagnosztika)

Ez a track a Samsung Galaxy S25 Ultra natív összeomlási problémájára, a hiányzó ikonok javítására és a Supabase bejelentkezési elakadások megkerülésére (bypass) fókuszált.

## Feladatok & Státusz

- [x] **EAS Build profil (`development-client`):** 
  - Beállítottuk a `development-client` profilt a `eas.json` fájlban, ami egy natív hibakonzollal ellátott fejlesztői verziót buildel.
  - Ellenőriztük a `@expo/vector-icons` és az `expo-dev-client` függőségek meglétét.
- [x] **Hiányzó ikonok javítása az Auth felületen:** 
  - A `src/screens/AuthScreen.tsx` fájlban a korábbi szöveges TextInput ikonokat lecseréltük explicit `@expo/vector-icons` `MaterialCommunityIcons` komponensekre, amik garantáltan kirajzolódnak Android 15+ eszközökön is (megoldva a hiányzó ikonok/téglalapok problémáját).
- [x] **Supabase Auth és DB Bypass (Proxy):** 
  - A `src/lib/supabase.ts` fájlban implementáltunk egy transzparens Proxy wrappert, ami fejlesztői környezetben (`__DEV__`) és aktív `BYPASS_AUTH` flag mellett automatikusan mockolja a Supabase Auth és a legfontosabb táblák (`profiles`, `business_profiles`, `grant_matches`, `action_plans`, `action_tasks`) lekérdezéseit.
  - Ezzel az alkalmazás azonnal bypass-olja a bejelentkező felületet, kiküszöböli a Supabase RLS korlátokat és az elakadt e-mail megerősítést, felgyorsítva a belső tesztelést.

## Diagnosztikai parancsok

- **Fejlesztői build futtatása:** `eas build --profile development-client --platform android`
- **Metro indítása klienssel:** `npx expo start --dev-client`
- **Natív crash logok kinyerése USB-n:** `adb logcat AndroidRuntime:E *:S`
