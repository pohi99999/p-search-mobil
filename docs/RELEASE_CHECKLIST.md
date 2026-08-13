# Release Checklist

Ez a lista azért jött létre, mert egy 2026-08-13-i teljes projekt-audit során kiderült, hogy a local fejlesztés és az éles (Supabase, Vercel, EAS/Play Store) állapot jelentősen szétcsúszhat anélkül, hogy bárki észrevenné: két biztonsági javítás Edge Function-je sosem lett deploy-olva, egy tábláról hiányzott az RLS policy, hiányoztak secretek, és az Auth Site URL élesben `localhost`-ra mutatott. Ez a checklist arra való, hogy ez ne ismétlődhessen meg észrevétlenül. Lásd: `GEMINI.md` 2026-08-13-i bejegyzése a teljes részletekért.

Fusd le ezt a listát **minden release előtt** (EAS build + Play Store submit, vagy jelentősebb Supabase/Vercel változtatás előtt).

## 1. Kód-oldali ellenőrzések (local)

- [ ] `npm run typecheck` — 0 hiba
- [ ] `npm run lint` — 0 hiba
- [ ] `npx jest` — minden suite zöld
- [ ] `deno test --allow-env supabase/functions/increment-search-count/` — zöld
- [ ] `deno test --allow-env supabase/functions/trigger-n8n-webhook/` — zöld
  (a CI ezt automatikusan futtatja minden push/PR-en — de ha új Edge Function tesztet adsz hozzá, ellenőrizd hogy a `.github/workflows/ci.yml`-ben is szerepel-e a `deno test` lépése rá)
- [ ] `npm audit` — nézd át, hogy nincs-e új, magas súlyosságú, **futásidejű** (nem build-tooling) sebezhetőség

## 2. Supabase — éles állapot vs. helyi kód

Ez a lépéssorozat pontosan azokat a hibákat fogja meg, amik a 2026-08-13-i audit során előkerültek.

- [ ] **Edge Functions**: `npx supabase functions list` — a listában szereplő függvények **száma és neve egyezzen** a helyi `supabase/functions/` alatti mappákéval. Ha bármelyik hiányzik, `npx supabase functions deploy <name>` a hiányzókra.
- [ ] **RLS Advisors**: nyisd meg a Supabase Dashboardot → Database → **Advisors** fület (vagy `https://supabase.com/dashboard/project/<ref>/advisors/security`), és ellenőrizd, hogy nincs "RLS Disabled" vagy "No policies" figyelmeztetés egyetlen táblán sem. Ez automatikusan felfedi az `action_plans`-hoz hasonló hiányosságokat, anélkül hogy kézzel kellene végigmenni minden táblán.
- [ ] **Edge Function Secrets**: `npx supabase secrets list` — ellenőrizd, hogy minden, a kódban ténylegesen használt secret (`GEMINI_API_KEY`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `ALLOWED_ORIGIN`) szerepel-e. Ha új Edge Function-t adsz hozzá új env-változóval, itt kell frissíteni.
- [ ] **Auth → URL Configuration**: Site URL és Redirect URLs a valós production URL-re mutassanak (jelenleg: `https://p-search-mobil.vercel.app`), NE `localhost`-ra.
- [ ] **Migrations**: `npx supabase db push --dry-run` — "Remote database is up to date" legyen a válasz; ha nem, van egy nem alkalmazott migráció.

## 3. Vercel (web deploy)

- [ ] `npx vercel env ls` — `EXPO_PUBLIC_SUPABASE_URL` és `EXPO_PUBLIC_SUPABASE_ANON_KEY` szerepeljen Production és Preview környezetekhez is (statikus export build-időben olvassa be ezeket — ha hiányoznak, üres képernyőt kapsz futásidőben, ahogy 2026-08-13-án is történt).
- [ ] `npx vercel ls` — a legutóbbi Production deployment státusza **Ready** legyen.
- [ ] Nyisd meg a production URL-t böngészőben, ellenőrizd hogy nem üres/fehér a képernyő és nincs konzol hiba.

## 4. EAS / Android / Play Store

- [ ] `app.json` és `eas.json` bundle ID / package neve egyezzen a Play Console-ban látottal.
- [ ] Android keystore/signing credential megvan az EAS projektben (`npx eas credentials`).
- [ ] Production AdMob és RevenueCat kulcsok be vannak-e állítva (nem teszt/placeholder értékek) — ellenőrizd `.env`-ben és/vagy EAS secrets-ben.
- [ ] `npx eas build --platform android --profile production` — sikeres build.
- [ ] `npx eas submit --platform android` — sikeres submit a megfelelő Play Store track-re.
- [ ] Play Console-ban ellenőrizd: app tartalmi besorolás, adatvédelmi szabályzat linkje, store listing screenshotok naprakészek.

## 5. Monitorozás

- [ ] `EXPO_PUBLIC_SENTRY_DSN` be van állítva production build-hez, ha hiba-riportálás kell (`logger.error`/`warn` automatikusan Sentry-be küld, ha a DSN be van állítva — lásd `src/utils/logger.ts`).
- [ ] Release után néhány órával nézd meg a Sentry dashboardot és a Supabase Edge Function logokat (`npx supabase functions logs <name>`) új hibákra.

## Miért fontos ez

A 2026-08-13-i audit során a **kód sokkal fejlettebb volt, mint ami ténylegesen futott élesben**: két deploy-olatlan biztonsági javítás Edge Function, egy RLS nélküli tábla, hiányzó secretek és egy `localhost`-ra mutató Auth URL — mindegyik hetekig/hónapokig észrevétlen maradhatott volna, ha nincs egy teljes körű audit. Ez a checklist nem helyettesíti az alapos tesztelést, de a leggyakoribb "helyi jó, éles rossz" hibaosztályt lefedi egy 10 perces átfutással.
