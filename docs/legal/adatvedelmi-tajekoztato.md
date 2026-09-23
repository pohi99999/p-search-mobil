# P-Search – Adatvédelmi tájékoztató

**Hatályos:** 2026. szeptember [nap]. · **Verzió:** 1.0 (tervezet)

Ez a tájékoztató a P-Search (Pályázat Kereső) mobilalkalmazásra (Android, csomagnév: `com.pohankaestarsa.psearch`) vonatkozik. Leírja, milyen személyes adatot kezelünk, milyen célból, meddig, kinek adjuk át, és milyen jogai vannak.

## 1. Az adatkezelő

- **Név:** Pohánka József Péter (magánszemély, az alkalmazás fejlesztője)
- **Kapcsolat:** peterpohankapersonal@gmail.com · +36 30 429 1227
- **Postacím:** 8900 Zalaegerszeg, Berek utca 38.

## 2. Milyen adatokat kezelünk, miért és milyen jogalapon

| Adatkör | Konkrét adatok | Cél | Jogalap (GDPR) |
|---|---|---|---|
| Fiók | e-mail cím, jelszó (titkosítva, mi nem látjuk), név (ha megadja) | bejelentkezés, fiókkezelés | 6. cikk (1) b) – szerződés teljesítése |
| Cégprofil | cégnév, adószám, TEÁOR-kód, létszám, árbevétel, célok | a céghez illő pályázatok megkeresése | 6. cikk (1) b) |
| Keresések és találatok | keresések száma és ideje, pályázat-találatok és azok indoklása | szolgáltatás nyújtása, napi keresési keret | 6. cikk (1) b) |
| Copilot (AI-asszisztens) | a beírt kérdések, a generált akcióterv és dokumentum | kérésre akcióterv és dokumentum készítése | 6. cikk (1) b) |
| Feltöltött dokumentumok | a feltöltött fájl, a belőle kinyert szöveg | a dokumentum feldolgozása az Ön kérésére | 6. cikk (1) b) |
| Előfizetés | előfizetési állapot, vásárlási azonosítók (kártyaadatot NEM látunk, azt a Google Play kezeli) | Pro csomag nyújtása | 6. cikk (1) b) és c) – jogszabályi kötelezettség |
| Hirdetések (ingyenes verzió) | eszköz- és hirdetésazonosító, alapvető eszközadatok | hirdetés megjelenítése; **csak nem személyre szabott hirdetést kérünk** | 6. cikk (1) f) – jogos érdek a szolgáltatás ingyenes változatának finanszírozásában |
| Üdvözlő e-mail | e-mail cím, cégnév, név (ha megadja) | egyszeri üdvözlő levél a cégprofil létrehozásakor | 6. cikk (1) b) |
| Belső értesítés új regisztrációról | cégnév, TEÁOR-kód, létszám, árbevétel, célok | az adatkezelő értesítése az új felhasználóról, a szolgáltatás minőségének figyelése | 6. cikk (1) f) – jogos érdek |
| Hibanapló | hibaüzenet, eszköztípus, rendszerverzió, teljesítmény-mintavétel | hibák javítása, stabil működés | 6. cikk (1) f) – jogos érdek |

Az alkalmazás **nem** kér helymeghatározást, névjegyeket, kamerát vagy mikrofont, és nem használ külön analitikai követőt.

## 3. Mesterséges intelligencia használata

A pályázat-kereséshez, a Copilot-válaszokhoz és a dokumentumok feldolgozásához a **Google Gemini** nyelvi modellt használjuk. A modell a mi szerverünkön (Supabase Edge Functions) keresztül kapja meg az adott feladathoz szükséges adatokat (cégprofil, kérdés, dokumentum szövege). A Gemini API-n küldött adatokat a Google az API-feltételei szerint nem használja modelltanításra. Az AI-válasz tájékoztató jellegű; a pályázati döntés és beadás az Ön felelőssége.

## 4. Adatfeldolgozók (akiknek átadjuk az adatot)

| Szolgáltató | Feladat | Adatok helye |
|---|---|---|
| Supabase Inc. | adatbázis, bejelentkezés, szerveroldali függvények | EU (Írország, eu-west-1) |
| Google LLC – Gemini API | AI-feldolgozás | Google infrastruktúra, EU-n kívül is |
| RevenueCat Inc. | előfizetés-kezelés | USA |
| Google LLC – Google Play | vásárlás, fizetés, alkalmazás-terjesztés | Google infrastruktúra |
| Google LLC – AdMob | hirdetések (csak az ingyenes verzióban) | Google infrastruktúra |
| Functional Software Inc. (Sentry) | hibanapló | USA |
| Google LLC – Gmail | az üdvözlő e-mail kézbesítése | Google infrastruktúra |
| Telegram (Telegram Messenger Inc.) | belső értesítés az adatkezelőnek új regisztrációról | EU-n kívül is |
| n8n (saját üzemeltetés) és helyi AI-modell (Ollama) | az értesítés összeállítása és rövid összefoglaló, az adatkezelő saját gépén | az adatkezelő saját infrastruktúrája |

Az EU-n kívüli (USA) adattovábbítás az EU–USA Adatvédelmi Keretrendszer és/vagy az Európai Bizottság általános szerződési feltételei alapján történik. Adatot nem adunk el, és marketingcélra harmadik félnek nem adunk át.

## 5. Meddig őrizzük az adatokat

- **Fiók, cégprofil, keresések, Copilot, dokumentumok:** a fiók törléséig; törléskor 30 napon belül véglegesen töröljük.
- **Előfizetési és számviteli adatok:** a jogszabályban előírt ideig (számviteli/adózási célra legfeljebb 8 évig).
- **Hibanapló (Sentry):** legfeljebb 90 nap.
- **Hirdetési adatok:** a Google AdMob saját szabályai szerint.

## 6. Az Ön jogai

Kérheti adatai **megismerését**, **helyesbítését**, **törlését**, a kezelés **korlátozását**, az adatok **hordozhatóságát**, és **tiltakozhat** a jogos érdeken alapuló kezelés ellen. Kérését a fenti e-mail címre küldje; legfeljebb 1 hónapon belül válaszolunk.

**Fiók és adatok törlése:** [az alkalmazásban: Beállítások → Fiók törlése] vagy e-mailben a fenti címen, a fiókhoz tartozó e-mail címről. A törlés a fiókot, a cégprofilt, a kereséseket, a Copilot-előzményeket és a feltöltött dokumentumokat érinti; a jogszabály miatt megőrzendő vásárlási adatok kivételek.

Panasz esetén a **Nemzeti Adatvédelmi és Információszabadság Hatósághoz** fordulhat (1055 Budapest, Falk Miksa utca 9–11., ugyfelszolgalat@naih.hu, www.naih.hu), vagy bírósághoz.

## 7. Biztonság

Az adatokat titkosított kapcsolaton (HTTPS) továbbítjuk. Az adatbázisban sorszintű hozzáférés-szabályozás biztosítja, hogy minden felhasználó csak a saját adatait érje el.

## 8. Gyermekek

Az alkalmazás vállalkozásoknak szól, 16 éven aluliak számára nem ajánlott. Tudatosan nem kezelünk 16 év alatti személyek adatait.

## 9. Változások

Ha a tájékoztató érdemben változik, az alkalmazásban és ezen az oldalon jelezzük.

---

# P-Search – Privacy Policy

**Effective:** September [day], 2026 · **Version:** 1.0 (draft)

This policy applies to the P-Search (Grant Finder) mobile app (Android, package `com.pohankaestarsa.psearch`). It explains what personal data we process, why, for how long, who we share it with, and your rights.

## 1. Data controller

- **Name:** József Péter Pohánka (private individual, developer of the app)
- **Contact:** peterpohankapersonal@gmail.com · +36 30 429 1227
- **Postal address:** Berek utca 38., 8900 Zalaegerszeg, Hungary

## 2. What we process, why, and on what legal basis

| Category | Data | Purpose | Legal basis (GDPR) |
|---|---|---|---|
| Account | e-mail address, password (hashed, not visible to us), name (optional) | sign-in, account management | Art. 6(1)(b) – contract |
| Company profile | company name, tax number, industry code, headcount, revenue, goals | finding matching grants | Art. 6(1)(b) |
| Searches and matches | number and time of searches, grant matches and their reasoning | providing the service, daily search limit | Art. 6(1)(b) |
| Copilot (AI assistant) | your questions, generated action plans and documents | creating plans and documents on request | Art. 6(1)(b) |
| Uploaded documents | the file and the text extracted from it | processing the document at your request | Art. 6(1)(b) |
| Subscription | subscription status, purchase identifiers (we never see card data; Google Play handles payment) | providing the Pro plan | Art. 6(1)(b) and (c) – legal obligations |
| Ads (free version) | device and advertising identifiers, basic device data | showing ads; **we request non-personalised ads only** | Art. 6(1)(f) – legitimate interest in funding the free version |
| Welcome e-mail | e-mail address, company name, name (optional) | a one-time welcome message when the company profile is created | Art. 6(1)(b) |
| Internal new-sign-up notice | company name, industry code, headcount, revenue, goals | notifying the controller of a new user, monitoring service quality | Art. 6(1)(f) – legitimate interest |
| Crash reports | error message, device model, OS version, performance samples | fixing bugs | Art. 6(1)(f) – legitimate interest |

The app does **not** request location, contacts, camera or microphone, and uses no separate analytics tracker.

## 3. Use of AI

Grant search, Copilot answers and document processing use the **Google Gemini** model. Only the data needed for the task (company profile, question, document text) is sent, via our own server (Supabase Edge Functions). Under the Gemini API terms, Google does not use this data to train its models. AI output is informational; decisions about applying for grants remain yours.

## 4. Processors

| Provider | Role | Location |
|---|---|---|
| Supabase Inc. | database, authentication, server functions | EU (Ireland, eu-west-1) |
| Google LLC – Gemini API | AI processing | Google infrastructure, may be outside the EU |
| RevenueCat Inc. | subscription management | USA |
| Google LLC – Google Play | purchases, payments, distribution | Google infrastructure |
| Google LLC – AdMob | ads (free version only) | Google infrastructure |
| Functional Software Inc. (Sentry) | crash reporting | USA |
| Google LLC – Gmail | delivering the welcome e-mail | Google infrastructure |
| Telegram (Telegram Messenger Inc.) | internal new-sign-up notice to the controller | may be outside the EU |
| n8n (self-hosted) and a local AI model (Ollama) | composing the notice and a short summary, on the controller's own machine | controller's own infrastructure |

Transfers to the USA rely on the EU–US Data Privacy Framework and/or the European Commission's Standard Contractual Clauses. We do not sell your data or share it with third parties for marketing.

## 5. Retention

- **Account, company profile, searches, Copilot, documents:** until you delete your account; permanently erased within 30 days of deletion.
- **Subscription and accounting records:** as long as required by law (for accounting/tax purposes up to 8 years).
- **Crash reports (Sentry):** up to 90 days.
- **Ad data:** under Google AdMob's own policies.

## 6. Your rights

You may request **access**, **rectification**, **erasure**, **restriction**, **data portability**, and you may **object** to processing based on legitimate interest. Send requests to the e-mail above; we reply within one month.

**Deleting your account and data:** [in the app: Settings → Delete account] or by e-mail to the address above, sent from the account's e-mail address. Deletion covers the account, company profile, searches, Copilot history and uploaded documents, except purchase records we must keep by law.

You may lodge a complaint with the Hungarian National Authority for Data Protection and Freedom of Information (NAIH, Falk Miksa utca 9–11., 1055 Budapest, ugyfelszolgalat@naih.hu, www.naih.hu) or go to court.

## 7. Security

Data is transmitted over HTTPS. Row-level security in the database ensures each user can only access their own data.

## 8. Children

The app is intended for businesses and is not directed at anyone under 16. We do not knowingly process data of children under 16.

## 9. Changes

We will announce material changes in the app and on this page.
