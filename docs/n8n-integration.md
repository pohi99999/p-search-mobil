# n8n AI Automatikus Pályázatkereső Integráció

## Architektúra és Adatáramlás

A P-Search mobil alkalmazás és az n8n háttérfolyamatok összekötése biztosítja a valósidejű, AI alapú pályázatkeresést. Az adatáramlás a következőképpen történik:

1. **User Onboarding:** A felhasználó az appban kitölti a cégadatokat (Cégnév, TEÁOR, Célok) az `OnboardingScreen`-en.
2. **Supabase INSERT:** A rendszer elmenti az adatokat a Supabase `business_profiles` táblájába.
3. **Database Trigger / Webhook hívás:**
   - Amikor egy új `business_profiles` rekord jön létre, vagy a `goals` / `industry_code` módosul, a Supabase egy Database Webhook-on (vagy Edge Functionön) keresztül egy HTTP POST kérést küld az n8n Production Webhook URL-jére.
   - *Alternatíva (költséghatékony):* Közvetlenül a mobil alkalmazásból küldjük el az Onboarding mentése után az n8n webhook hívást a `business_id`-val.
4. **n8n AI Keresés (Workflow):**
   - Az n8n megkapja a payloadban a `business_id`-t.
   - Lekérdezi a Supabase-ből a cég TEÁOR kódját és céljait (HTTP Request node).
   - Aktiválja az AI ágenst, ami keres a weben vagy a helyi tudásbázisban a megadott profilra szabott pályázatokat.
   - A megtalált pályázatokat az n8n betölti a `grants` táblába (ha még nincsenek benne).
   - Generál egy elemzést / egyezési értékelést az AI-al, és elmenti a `grant_matches` táblába.
5. **App Frissítés:** A mobilalkalmazás `HomeScreen`-je megjeleníti a friss adatokat (akár valós időben, Supabase Realtime feliratkozással).

## N8n Webhook Adatok (Példa)

**Webhook URL:** `https://[n8n-szerver-cime]/webhook/p-search-onboarding`
**Method:** `POST`

**Payload:**
```json
{
  "business_id": "uuid-of-the-business-profile",
  "user_id": "uuid-of-the-user",
  "action": "new_profile_created"
}
```

## Supabase Database Webhook Beállítása (Opcionális)

```sql
CREATE OR REPLACE FUNCTION notify_n8n_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM http_post(
    'https://[n8n-szerver-cime]/webhook/p-search-onboarding',
    json_build_object(
      'business_id', NEW.id,
      'user_id', NEW.user_id,
      'action', TG_OP
    )::text,
    'application/json'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profile_created_or_updated
AFTER INSERT OR UPDATE OF industry_code, goals ON business_profiles
FOR EACH ROW EXECUTE FUNCTION notify_n8n_on_profile_update();
```
*(Megjegyzés: a `http_post` használatához engedélyezni kell a `pg_net` kiegészítőt a Supabase-ben, amihez külön konfiguráció szükséges. Emiatt az App-ból történő direkt API hívás gyakran egyszerűbb és hibatűrőbb MVP szakaszban.)*

## Végleges Döntés MVP szakaszra

Az első verzióban **App-oldali API hívással** indítjuk el a keresést az Onboarding sikeres befejezése után. 
Ehhez az `OnboardingScreen.tsx`-ben a sikeres profilmentés után meghívunk egy `fetch`-et a megfelelő n8n webhookra, átadva a `business_id`-t.
