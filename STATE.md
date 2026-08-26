# STATE.md — Navi (Tutor & Average Speed Tracker)

> **File di standoff.** Fonte di verità per riprendere il contesto tra sessioni.
> Protocollo: al comando "Riprendi dallo standoff" → leggere questo file, analizzare
> l'ultimo commit, riassumere lo stato e attendere l'"Ok" prima di procedere.

## 📌 Task attualmente in lavorazione

**Nessuno.** Fase 4 completata; in attesa di autorizzazione per iniziare la Fase 5
(Motore Velocità Media).

## 🏗️ Decisioni architetturali

| Ambito | Decisione | Motivazione |
| --- | --- | --- |
| Framework | **Astro 5** (output statico) + **Preact islands** | App 100% client-side e local-first: niente SSR, zero JS superfluo. La UI interattiva (tachimetro 60fps) vive in island Preact (~4KB) con `@preact/signals` per aggiornamenti a grana fine senza re-render dell'albero. |
| Versione Astro | **5.x** (non 7.x, ultima major) | `@vite-pwa/astro` supporta ufficialmente fino ad Astro 5; scelta la strada stabile con pieno supporto dell'ecosistema PWA. |
| PWA | **`@vite-pwa/astro`** (wrapper di `vite-plugin-pwa`, Workbox `generateSW`) | Manifest + Service Worker con precache dell'intero output statico → apertura garantita in Airplane Mode. `registerType: autoUpdate`. |
| Storage offline | **Dexie** su IndexedDB (da introdurre in Fase 3) | API ergonomica, query indicizzate, ottimo supporto TS. |
| Backend | **Nessuno** (Local First) | Tutte le feature richieste vivono lato client. Se in futuro servirà sync live (Fase 7+), candidato: ExpressJS per condividere i tipi TS col client. Decisione rimandata. |
| Icone PWA | Generate da `scripts/generate-icons.mjs` (encoder PNG puro Node, zero dipendenze) | Riproducibili offline con `npm run icons`; include variante maskable con safe zone. |
| Alias import | `@/*` → `src/*` | Percorsi puliti nei componenti. |
| Sorgente velocità | `coords.speed` (Doppler GNSS) con fallback su derivata haversine | Il dato Doppler del chip è molto più stabile della derivata delle posizioni; il fallback copre desktop e browser che non lo espongono. La UI segnala quale delle due è in uso. |
| Smoothing velocità | 3 livelli: filtro mediano su 3 campioni → smoothing esponenziale a 60fps → snap sotto 0.05 km/h | La mediana uccide il singolo picco senza il ritardo di una media; l'esponenziale rende fluido il movimento tra un fix e l'altro (il GPS emette ~1 fix/s, la UI disegna a 60fps). |
| Rumore da fermo | Spostamento sotto `max(3 m, accuratezza × 0.5)` letto come 0 km/h | Da fermo il GPS "cammina" di qualche metro: senza questa soglia un'auto parcheggiata segnerebbe 5-10 km/h. Soglia legata all'accuratezza dichiarata dal fix. |
| Contesa sorgenti | Signal `speedSource` (`'mock' \| 'gps'`) | Mock e GPS non possono mai scrivere insieme sul tachimetro; con GPS attivo i controlli mock si disabilitano. |
| Anti-cloni | Raggio 6 m + media pesata per **inverso della varianza** (peso = 1/accuratezza²) | Una media semplice lascerebbe che un singolo fix a ±30 m sposti un varco già misurato bene decine di volte. Con la pesatura un fix a ±3 m vale ~100 volte uno a ±30 m — il rapporto corretto per combinare due misure indipendenti. Verificato: ricattura a 4 m con ±3 m su varco a ±30 m sposta la posizione di 3.96 m su 4. |
| Ricerca prossimità | Range query sull'indice `lat` → filtro haversine sui candidati | IndexedDB non ha query spaziali. La latitudine è l'unica dimensione con fattore di conversione costante (111.320 m/grado), quindi restringe bene prima del calcolo esatto delle distanze. |
| Concorrenza upsert | `db.transaction('rw', ...)` attorno a ricerca + scrittura | Senza transazione due catture ravvicinate potrebbero leggere entrambe "nessun varco vicino" e creare proprio i cloni che l'algoritmo deve evitare. |
| Mappa | Leaflet + tile OSM, import dinamico, `circleMarker` | Leaflet pesa più di tutto il resto dell'app: caricarlo solo su `/varchi` tiene leggero il tachimetro, che è la schermata che si apre in auto. I `circleMarker` evitano le icone PNG di default (asset esterni che si rompono offline). |
| Tile offline | Workbox `runtimeCaching` CacheFirst su `tile.openstreetmap.org` (400 tile, 30 giorni) | Le tile sono infinite e non possono stare nella precache; conservarle man mano rende navigabili offline le zone già consultate. |

## 🗺️ Roadmap

### Fase 1: Inizializzazione, PWA e Standoff ✅
- [x] Dichiarazione e motivazione dello stack (Astro 5 + Preact + @vite-pwa/astro)
- [x] Progetto base inizializzato (layout, pagina placeholder, stile fondazione dark)
- [x] Manifest configurato (nome, icone 192/512/maskable, standalone, portrait, theme color)
- [x] Service Worker Workbox: precache completa output, `navigateFallback: '/'`, autoUpdate
- [x] Registrazione SW nel layout (`virtual:pwa-register`)
- [x] Creazione `STATE.md` e primo commit di setup

### Fase 2: Theming Engine e UI Core ✅
- [x] Layout principale (`Dashboard.tsx`) + store globale temi (`src/lib/themes.ts`: registro estendibile, persistenza in localStorage, token CSS per tema in `src/styles/themes.css` via `data-theme`)
- [x] Mock della velocità (`src/lib/speed.ts`): slider manuale + "demo drive" con accelerazioni/frenate simulate; smoothing esponenziale a 60fps (`smoothSpeed`)
- [x] Tachimetro **Analogico** (SVG, quadrante con tacche/etichette, lancetta fluida)
- [x] Tachimetro **Digitale** (numero gigante tabular-nums + barra di progresso)
- [x] Tachimetro **Retro Digital Dashboard** (28 barrette verdi luminescenti ad arco + display a 7 segmenti disegnato in SVG, zero font esterni)
- [x] Slot UI "MEDIA TUTOR" predisposto (si popola in Fase 5)
- [x] Verifica visiva dei 3 temi via Chromium/Playwright (screenshot) + persistenza tema dopo reload

### Fase 3: Core GPS Tracker e Database Offline ✅
- [x] Setup Dexie/IndexedDB (`src/lib/db.ts`): DB `navi` v1 con tabelle `fixes` (indice su `t`) e `settings` (key/value); helper `getSetting`/`setSetting`, `pruneOldFixes`, `countFixes`
- [x] Provider GPS (`src/lib/gps.ts`): `watchPosition` ad alta accuratezza, signal di stato (`gpsStatus`, `gpsStale`, `lastFix`, `gpsError`), persistenza best-effort di ogni fix accettato
- [x] Calcolo velocità istantanea con smoothing a 3 livelli (vedi sotto)
- [x] Helper geodetici (`src/lib/geo.ts`): distanza haversine e bearing — base anche per l'anti-cloni di Fase 4
- [x] UI: barra di stato GPS (qualità fix a colori, ±metri, sorgente doppler/derivata), pulsante AVVIA/FERMA TRACKING, pannello diagnostica con conteggio fix e potatura
- [x] Wake Lock (`src/lib/wakelock.ts`): schermo acceso durante il tracking, riacquisito al ritorno in foreground
- [x] Verifica end-to-end con geolocalizzazione simulata (Playwright): 100 km/h simulati → 100 km/h mostrati; drift da fermo → 0 km/h; 65 fix persistiti e rileggibili dopo reload
- [x] Verifica **Airplane Mode**: app caricata offline dal service worker con lettura dati da IndexedDB
- [x] Verifica permesso negato: messaggio azionabile e pulsante "RIPROVA" (nessun vicolo cieco)

### Fase 4: Gestione Varchi e Normalizzazione ✅
- [x] Pagina dedicata `/varchi` con i 3 metodi di inserimento a tab
- [x] **GRANDE PULSANTE** circolare di cattura GPS istantanea, con feedback aptico (`navigator.vibrate`) e messaggio che dice se ha creato o fuso un varco
- [x] Inserimento per coordinate manuali (parser tollerante virgola/punto, validazione range) + limite di velocità della tratta
- [x] Mappa interattiva Leaflet con click-to-pick, caricata in **import dinamico** (non pesa sul tachimetro); marker `circleMarker` senza asset esterni; cerchio del raggio anti-cloni disegnato in scala reale
- [x] Salvataggio varchi su IndexedDB (schema v2, tabella `gates`)
- [x] Algoritmo anti-cloni (`src/lib/gates.ts`) con raggio 6 m e media pesata per inverso della varianza
- [x] Elenco varchi con rinomina, limite di velocità ed eliminazione
- [x] Caching runtime delle tile OSM nel service worker (zone già viste navigabili offline) + banner di degrado quando le tile mancano
- [x] Verifica end-to-end: merge a 4 m/5 m, nuovo varco a 50 m, anti-cloni **cross-metodo** (manuale e mappa confluiscono in un varco GPS), validazione coordinate

### Fase 5: Motore Velocità Media ⬜
- [ ] Trigger ingresso varco → avvio calcolo media in tempo reale
- [ ] UI velocità media vs limite della tratta

### Fase 6: Storico e Tracciamento Viaggi ⬜
- [ ] Salvataggio tragitti (Inizio-Fine) e checkpoint (orario + velocità al passaggio) su IndexedDB
- [ ] Pagina "Storico" con raggruppamento per Giorni e Percorsi

### Fase 7: Auth Mock e Modelli Social ⬜
- [ ] Utente "Test" locale fittizio (bypassabile)
- [ ] Modelli dati Profilo/Avatar e coordinate live (predisposizione sync cloud)
- [ ] Flussi UI predisposti per futuri Apple/Google Login

## 📦 Dipendenze introdotte

- `astro@^5` — framework, output statico
- `@astrojs/preact@^4` + `preact@^10` + `@preact/signals@^2` — islands interattive
- `@vite-pwa/astro@^1` (dev) — Manifest + Service Worker Workbox
- `typescript@^5` (dev)
- `playwright-core` (dev) — verifica visiva headless con il Chromium di sistema (nessun download browser)
- `dexie@^4` — wrapper IndexedDB per lo storage offline
- `leaflet@^1` + `@types/leaflet` (dev) — mappa interattiva (caricata solo su `/varchi`)

## 🛠️ Comandi

- `npm run dev` — dev server
- `npm run build` — build produzione (genera anche `sw.js` e `manifest.webmanifest`)
- `npm run preview` — serve la build (per testare la PWA/offline)
- `npm run icons` — rigenera le icone PNG in `public/icons/`

## 📝 Note per la prossima sessione

- La PWA è installabile e apre offline dopo la prima visita (precache Workbox).
- `devOptions.enabled: false`: il SW è attivo solo in build/preview, non in dev.
- **Interfaccia sorgente velocità**: il GPS (Fase 3) dovrà solo scrivere `rawSpeed`
  in `src/lib/speed.ts`; smoothing e UI sono già agganciati a `smoothSpeed`.
  Il pannello `MockControls` andrà nascosto/degradato a strumento dev quando
  arriverà il provider GPS reale.
- Theming: per aggiungere un tema → entry in `THEMES` (`src/lib/themes.ts`) +
  blocco `[data-theme='...']` in `src/styles/themes.css`. Il tema attivo è
  applicato via `data-theme` su `<html>`; uno script inline in `index.astro`
  lo ripristina da localStorage prima dell'idratazione (niente flash).
- Il display a 7 segmenti è SVG puro (`SevenSegment.tsx`): nessun webfont da
  scaricare, resa identica offline.
- **Schema DB**: le tabelle dei varchi Tutor (Fase 4) e di viaggi/checkpoint
  (Fase 6) si aggiungono in `src/lib/db.ts` con `.version(2).stores({...})`;
  Dexie migra da solo i database già presenti sui device. Non modificare la
  `version(1)` esistente.
- **Filtri GPS** in `FILTERS` (`src/lib/gps.ts`): accuratezza max 100 m, velocità
  implausibile oltre 400 km/h, soglia fermo 1.5 km/h (Doppler), segnale
  considerato perso dopo 5 s senza fix. In galleria la UI mostra "Segnale perso"
  ma **non** azzera la velocità (l'auto sta ancora viaggiando).
- Il pannello "Diagnostica" resta utile in Fase 4+: mostra fix salvati e scartati.
- **I varchi hanno già il campo `speedLimit`**: la Fase 5 può leggerlo senza
  migrazioni di schema. Il motore della media dovrà usare `findNearbyGate()`
  (già pronto e testato) per rilevare l'ingresso in un varco, con un raggio di
  trigger più largo di `CLONE_RADIUS_M` — a 130 km/h si percorrono ~36 m al
  secondo, quindi il raggio di 6 m usato per la normalizzazione verrebbe
  mancato tra un fix e l'altro. Valutare ~50 m più il controllo del passaggio
  effettivo (distanza che smette di diminuire).
- La cattura GPS riusa `lastFix` se fresco (< 3 s), altrimenti fa un
  `getCurrentPosition` una tantum: premendo il pulsante a 130 km/h non si può
  aspettare l'aggancio del segnale.
