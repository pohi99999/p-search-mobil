# P-Search Mobil - Belső és Manuális Tesztelési Útmutató

Ez a dokumentum lépésről lépésre végigvezet a belső tesztelési fázis (Phase 5) manuális feladatain.

---

## 1. APK Build indítása (Teszt verzió)
Ahhoz, hogy az alkalmazást közvetlenül telepíteni tudd egy fizikai Android eszközre, le kell generálni a belső tesztelésre szánt `.apk` fájlt.

Futtasd a következő parancsot a terminálodban:
```bash
eas build --profile preview --platform android
```
*(Ha helyben, a saját géped erőforrásaival szeretnéd futtatni az Expo felhő helyett, használd a `--local` kapcsolót is: `eas build --profile preview --platform android --local`)*

A folyamat végén kapsz egy közvetlenül letölthető `.apk` fájlt az Expo Dashboard-ról vagy a terminálból.

---

## 2. APK telepítése az Android eszközödre
1. Töltsd le a generált `.apk` fájlt a telefonodra (pl. másold át USB-n, küldd el magadnak Google Drive-on, vagy olvasd be a generált QR-kódot).
2. Nyisd meg a letöltött fájlt a telefonodon.
3. Engedélyezd az **"Ismeretlen forrásokból származó alkalmazások telepítése"** opciót, ha a rendszer kéri.
4. Telepítsd fel az alkalmazást.

---

## 3. Funkciók fizikai tesztelése

### A. Supabase adatbázis kapcsolat
- Nyisd meg az alkalmazást.
- Hozz létre egy új fiókot vagy jelentkezz be egy létezővel az `AuthScreen` segítségével.
- Töltsd ki a cégadatokat (Onboarding), mentés után győződj meg róla, hogy az adatok megjelentek a Supabase `business_profiles` táblájában és a kezdőképernyőn.

### B. AdMob teszthirdetések (Ingyenes Freemium verzió)
- **Banner hirdetés:** Ellenőrizd, hogy az `OnboardingScreen` és a `HomeScreen` legalján megjelenik-e a Google AdMob teszthirdetési bannerje ("Test Ad").
- **Átvezető (Interstitial) hirdetés:** 
  1. Nyiss meg egy aktív pályázati akciótervet (`ActionPlanScreen`).
  2. Kattints a **"PDF Generálása"** (vagy Újragenerálás) gombra.
  3. Ellenőrizd, hogy a dokumentum generálása előtt felugrik-e egy teljes képernyős teszthirdetés.
  4. Zárd be a hirdetést, és győződj meg róla, hogy a bezárás után a PDF generálása zökkenőmentesen folytatódik és elkészül.

### C. RevenueCat tesztvásárlás (Pro előfizetés)
- A kezdőlapon kattints a Pro / Előfizetési felület gombjára (ami a `PaywallScreen`-re visz).
- Válaszd az előfizetést. Mivel ez belső teszt build, a Google Play Billing Sandbox felület fog felugrani.
- Végezd el a tesztvásárlást (használd a Play Billing által kínált sikeres tesztkártyát).
- **Változások ellenőrzése a sikeres vásárlás után:**
  1. Győződj meg róla, hogy a profilod `isPro` állapota `true` lett (megjelenik a ⭐ PRO jelzés a fejlécben).
  2. Ellenőrizd, hogy a **HomeScreen** és **OnboardingScreen** aljáról **eltűnt-e** a banner hirdetés.
  3. Generálj újra egy PDF-et a tesztelt akciótervedből. Ellenőrizd, hogy Pro felhasználóként **már egyáltalán nem jelenik meg** az átvezető interstitial hirdetés, hanem azonnal elindul a generálás.
  4. Kattints a **"Korábbi vásárlások visszaállítása"** gombra a Paywall-on, és ellenőrizd, hogy a jogosultság sikeresen visszaáll-e.

### D. PDF Generálás és Mentés
- Generálj egy PDF dokumentumot.
- Miután elkészült és eltárolódott az `ai_context` mezőben, kattints a **"Mentett PDF"** gombra.
- Ellenőrizd, hogy a rendszer megnyitja-e a natív megosztási és mentési párbeszédpanelt (`expo-sharing`).

---

## 4. Éles AAB build indítása a Play Áruházhoz
Ha minden fenti pont hibátlanul működött, készítsd el az áruházba szánt `.aab` csomagot:
```bash
eas build --profile production --platform android
```

---

## 5. Google Play Console zárt tesztelés előkészítése
1. Jelentkezz be a **Google Play Console** felületére.
2. Válaszd ki a **P-Search** alkalmazást.
3. Keresd meg a bal oldali menüben a **Tesztelés -> Zárt tesztelés** (Closed Testing) szekciót.
4. Hozz létre egy új verziót és töltsd fel a generált `.aab` fájlt.
5. Menj a **Tesztelők** (Testers) fülre.
6. Hozz létre egy tesztelői listát és add hozzá a 20 béta tesztelő email címét.
7. Másold ki a tesztelőknek szánt **regisztrációs linket** (opt-in link), és küldd el nekik, hogy csatlakozni tudjanak a 14 napos tesztelési fázishoz!
