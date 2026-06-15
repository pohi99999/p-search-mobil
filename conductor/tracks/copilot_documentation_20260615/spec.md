# Track Specification: Copilot és Dokumentáció (Fázis 4)

## 1. Cél
A P-Search mobilalkalmazás bővítése interaktív asszisztenssel (AI Copilot), feladatkezelővel (Action Plan) és automatikus dokumentumgenerálási képességekkel. A cél, hogy a felhasználók a számukra alkalmas pályázat kiválasztása után azonnal elindíthassák a felkészülési és pályázati folyamatot.

## 2. Funkciók (Features)
- **Action Plan UI:** A felhasználó a kiszemelt pályázathoz kapcsolódóan kap egy teendőlistát (ToDo / Kanban felület), ami lépésekre bontja a pályázat benyújtásának feltételeit.
- **AI Asszisztens Chatbot:** Egy beépített chat felület, ahol a felhasználó közvetlenül kérdezhet a pályázattal kapcsolatban. Az AI a cégprofil adatok és a pályázati kiírás alapján ad válaszokat, valamint segít a szükséges adatok interaktív pontosításában.
- **Dokumentum Generátor:** A chatbot által gyűjtött válaszok és a cégprofil alapján az AI sablonokat tölt ki (pl. üzleti terv vázlat, nyilatkozatok), amelyeket a mobilalkalmazás PDF formátumba exportál és menthetővé/megoszthatóvá tesz.

## 3. Technikai részletek
- **UI:** React Native Paper kártyák és listák az Action Planhez; Gifted Chat vagy egyedi chat felület az AI Asszisztenshez.
- **Backend/AI:** Supabase Edge Function-ök, amelyek meghívják a Gemini API-t (vagy Ollama-t) a chat kontextus és a dokumentum szöveg generálásához.
- **Adatbázis:** Új táblák a teendők (`action_tasks`) és a chat üzenetek tárolására.
- **PDF Export:** React Native-kompatibilis PDF generáló modul (`expo-print`, `expo-sharing`).
