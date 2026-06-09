# Product Guidelines

## 1. Design & UX (Material Design 3)
- **Letisztult és Professzionális:** "Glass box" megközelítés, átlátható folyamatokkal. Ne legyen túlzsúfolt a felület.
- **Költséghatékony (Zero-budget) de prémium:** A React Native Paper biztosítja a komponenseket. A design ne tűnjön MVP-nek, nyújtson wow-élményt animációkkal és gondos tipográfiával.
- **Folyamatos visszajelzés:** Mivel az n8n a háttérben dolgozik, a felületen Skeleton loader-ek és állapotjelzők kommunikálják a folyamatokat.

## 2. Architektúra és Minőség
- **Platform-függetlenség:** Bár az elsődleges fókusz Android, minden kódot úgy kell megírni (Expo), hogy könnyen forduljon iOS-re és Webre is.
- **Moduláris fejlesztés:** Komponens alapú felépítés a `src/components` és képernyők a `src/screens` mappákban.
- **"God Mode" integráció:** Az AI vezérelt (Copilot) funkciók a jövőben zökkenőmentesen épüljenek be az Onboarding és Kereső fázisokba.
