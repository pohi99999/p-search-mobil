const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Környezeti változók betöltése a .env fájlból
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.trim().split('=');
      if (parts.length >= 2 && !line.startsWith('#')) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
    console.log('.env fájl sikeresen betöltve.');
  }
} catch (err) {
  console.warn('Nem sikerült betölteni a .env fájlt:', err.message);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.LEEROOPEDIA_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Hiba: Supabase URL vagy kulcs hiányzik a környezeti változókból.');
  process.exit(1);
}

if (!geminiApiKey) {
  console.error('Hiba: GEMINI_API_KEY környezeti változó hiányzik.');
  process.exit(1);
}

// Supabase és Gemini inicializálása
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

// 2. Valósághű GINOP Plusz-1.2.1-21 pályázat leírás és chunks
const grantData = {
  title: "GINOP Plusz-1.2.1-21 - A mikro-, kis- és középvállalkozások modern üzleti és termelési kihívásokhoz való alkalmazkodását segítő fejlesztések támogatása",
  provider: "Nemzetgazdasági Minisztérium",
  grant_type: "Vissza nem térítendő és hitel hibrid",
  amount_min: 10000000,
  amount_max: 629300000,
  deadline: "2027-12-31T23:59:59Z",
  eligibility_criteria: "Magyarországi KKV-k, minimum 3 fő statisztikai létszám, legalább egy lezárt üzleti év.",
  description: "A hazai mikro-, kis- és középvállalkozások technológiai és digitális megújulását támogató kiírás, különös tekintettel az eszközbeszerzésre, AI integrációra és szoftverfejlesztésre.",
  source_url: "https://www.palyazat.gov.hu"
};

const chunks = [
  {
    content: "A GINOP Plusz-1.2.1-21 pályázat célja a hazai mikro-, kis- és középvállalkozások technológiai megújulásának támogatása. A program keretében a vállalkozások támogatást kaphatnak az új technológiák bevezetésére, az üzleti folyamatok digitalizálására, valamint a termelési kapacitások bővítésére, elősegítve a modern üzleti kihívásokhoz való alkalmazkodást.",
    metadata: { section: "Összefoglaló és célok", regions: "Kevésbé fejlett régiók" }
  },
  {
    content: "A pályázat keretében elnyerhető támogatás összege minimum 10.000.000 Ft, maximum 629.300.000 Ft lehet. A támogatás formája vissza nem térítendő támogatás és visszatérítendő hitel hibrid kombinációja. A támogatási intenzitás elérheti az elszámolható költségek maximum 70%-át, a projekt megvalósítási helyszínétől függően.",
    metadata: { section: "Támogatási összegek", regions: "Kevésbé fejlett régiók" }
  },
  {
    content: "A támogatásra azon magyarországi székhelyű vagy telephelyű KKV-k jogosultak, amelyek legalább egy lezárt, teljes üzleti évvel rendelkeznek, és éves átlagos statisztikai állományi létszámuk eléri a minimum 3 főt. Fontos feltétel, hogy a pályázó cégforma szerint korlátolt felelősségű társaság (Kft.), részvénytársaság (Rt.) vagy betéti társaság (Bt.) lehet.",
    metadata: { section: "Jogosultsági feltételek", regions: "Kevésbé fejlett régiók" }
  },
  {
    content: "Az elszámolható költségek körébe tartozik az új termelőeszközök és gépek beszerzése, információs technológiai fejlesztések (szoftverek, hardverek beszerzése), infrastrukturális és ingatlan beruházások, valamint a projekthez kapcsolódó képzések és tanácsadási szolgáltatások igénybevétele. AI integráció és felhőalapú üzleti szoftverek bevezetése kifejezetten támogatott tevékenység.",
    metadata: { section: "Elszámolható költségek", regions: "Kevésbé fejlett régiók" }
  },
  {
    content: "A projekt megvalósítási helyszíne Magyarország kevésbé fejlett régiói (Észak-Magyarország, Észak-Alföld, Dél-Alföld, Közép-Dunántúl, Nyugat-Dunántúl, Dél-Dunántúl) lehetnek. A Budapest területén megvalósuló projektek a Közép-Magyarország régió fejlettsége miatt nem támogathatók ezen kiírás keretében.",
    metadata: { section: "Területi korlátozások", regions: "Kevésbé fejlett régiók" }
  }
];

async function seed() {
  console.log("--- Pályázati RAG Adatbázis Feltöltés Indítása ---");
  
  try {
    // 1. Pályázat törzsadat beszúrása
    console.log("Pályázat beszúrása a 'grants' táblába...");
    const { data: insertedGrant, error: grantError } = await supabase
      .from('grants')
      .insert(grantData)
      .select('id')
      .single();

    if (grantError) {
      throw new Error(`Hiba a grants táblába beszúráskor: ${grantError.message}`);
    }

    const grantId = insertedGrant.id;
    console.log(`Pályázat sikeresen rögzítve, ID: ${grantId}`);

    // 2. Chunks embedding generálása és beszúrása
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Embedding generálása a(z) ${i + 1}/${chunks.length} bekezdéshez...`);
      
      const embedResult = await embeddingModel.embedContent({
        content: { parts: [{ text: chunk.content }] }
      });
      
      if (!embedResult?.embedding?.values) {
        throw new Error(`Nem sikerült embeddinget generálni a(z) ${i + 1}. bekezdéshez.`);
      }

      const embedding = embedResult.embedding.values;
      
      console.log(`Bekezdés beszúrása a 'grant_chunks' táblába...`);
      const { error: chunkError } = await supabase
        .from('grant_chunks')
        .insert({
          grant_id: grantId,
          content: chunk.content,
          embedding: embedding,
          metadata: chunk.metadata
        });

      if (chunkError) {
        throw new Error(`Hiba a grant_chunks táblába beszúráskor a(z) ${i + 1}. bekezdésnél: ${chunkError.message}`);
      }
    }

    console.log("Adatbázis sikeresen feltöltve teszt RAG adatokkal!");

  } catch (error) {
    console.error("Végzetes hiba a feltöltés során:", error.message);
    process.exit(1);
  }
}

seed();
