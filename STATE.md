# STATE.md — Navi (Tutor & Average Speed Tracker)

> **File di standoff.** Fonte di verità per riprendere il contesto tra sessioni.
> Protocollo: al comando "Riprendi dallo standoff" → leggere questo file, analizzare
> l'ultimo commit, riassumere lo stato e attendere l'"Ok" prima di procedere.

## 📌 Task attualmente in lavorazione

**Nessuno: roadmap completata e app pubblicata.** Tutte e 7 le fasi sono chiuse
e verificate; il deploy su GitHub Pages è configurato.

⚠️ **La validazione che manca**: l'app non è mai stata provata su un telefono
con un chip GPS reale. Tutti i test usano la geolocalizzazione simulata di
Playwright, che **non fornisce `coords.speed`** — quindi il ramo Doppler del
calcolo velocità non è mai stato eseguito, solo quello di fallback (derivata
haversine). Le soglie (raggio di trigger 60 m, anti-drift, filtri di qualità)
sono ragionate ma tarate su dati sintetici. Il prossimo passo concordato è
attendere una guida reale e ritarare su quella.

**Strumento di misura**: il pannello *Diagnostica* conta i fix per sorgente
(`N doppler · M derivati`, azzerati a ogni avvio del tracking). L'etichetta
nella barra di stato mostra solo l'ultimo fix e da fermo dice sempre
"derivata", perché il chip non fornisce la velocità Doppler a veicolo immobile:
il contatore è il dato da leggere a fine giro per sapere quale ramo ha davvero
alimentato il viaggio.

## 🏗️ Decisioni architetturali

| Ambito | Decisione | Motivazione |
| --- | --- | --- |
| Framework | **Astro 5** (output statico) + **Preact islands** | App 100% client-side e local-first: niente SSR, zero JS superfluo. La UI interattiva (tachimetro 60fps) vive in island Preact (~4KB) con `@preact/signals` per aggiornamenti a grana fine senza re-render dell'albero. |
| Versione Astro | **5.x** (non 7.x, ultima major) | `@vite-pwa/astro` supporta ufficialmente fino ad Astro 5; scelta la strada stabile con pieno supporto dell'ecosistema PWA. |
| PWA | **`@vite-pwa/astro`** (wrapper di `vite-plugin-pwa`, Workbox `generateSW`) | Manifest + Service Worker con precache dell'intero output statico → apertura garantita in Airplane Mode. `registerType: autoUpdate`. |
| Storage offline | **Dexie** su IndexedDB (da introdurre in Fase 3) | API ergonomica, query indicizzate, ottimo supporto TS. |
| Backend | **Nessuno, e a roadmap chiusa resta la scelta giusta** | Tutte e sette le fasi sono state realizzate lato client: nessun requisito ha richiesto un server. Un backend servirà solo per due cose che *non si possono* fare nel browser: validare i token Apple/Google (farlo client-side sarebbe teatro, non autenticazione) e ricevere le posizioni live condivise. Quando servirà: **ExpressJS**, per condividere i tipi TypeScript già definiti in `src/lib/db.ts` senza riscriverli. Il punto d'innesto esiste già: `SyncAdapter` in `src/lib/sync.ts` e `signInWithProvider` in `src/lib/auth.ts`. |
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
| Rilevamento transito | Punto di **massima vicinanza** (la distanza smette di calare e risale), non "sono entrato nel raggio" | Dà l'istante del transito con la precisione del singolo fix, indipendentemente da quanto è largo il raggio di trigger. |
| Raggio di trigger | 60 m (contro i 6 m della normalizzazione) | A 145 km/h si percorrono ~40 m per fix: un raggio stretto verrebbe scavalcato tra due rilevazioni. A 60 m ci sono sempre almeno 2-3 fix dentro la zona. Non è stato allargato oltre per non far scattare i varchi su strade parallele di servizio. |
| Uscita dalla zona = transito | Se si esce dal raggio con un minimo registrato e non ancora consumato, il passaggio viene emesso in quel momento | **Bug trovato dai test**: a 145 km/h il primo fix dopo il minimo è già oltre i 60 m, quindi il ramo di reset cancellava la sorveglianza prima della conferma e il varco d'uscita non veniva mai rilevato. |
| Simmetria apertura/chiusura tratta | All'apertura si **sommano** i metri percorsi dal transito al fix corrente; alla chiusura si **sottraggono** | Il transito è confermato 1-2 fix dopo il punto di minimo, ma il cronometro parte e si ferma all'istante del transito. Senza le due correzioni la media era prima sottostimata (145→133), poi sovrastimata (150→162). |
| Un viaggio = una sessione di tracking | `startTrip()` all'avvio del GPS, `endTrip()` all'arresto | È il confine "Inizio-Fine" che l'utente controlla davvero, senza euristiche sul veicolo fermo che sbaglierebbero in coda o al semaforo. |
| Frequenza di salvataggio | Viaggio riscritto ogni 10 fix; **checkpoint scritti subito** | Aggiornare la riga del viaggio a ogni fix sarebbero migliaia di scritture all'ora per un dato che nessuno sta guardando. Orario e velocità sotto un varco invece non si possono ricostruire a posteriori, quindi si persistono all'istante. |
| Viaggi orfani | Chiusi all'avvio sull'ultimo checkpoint registrato | Se l'app viene chiusa durante il tracking nessuno esegue `endTrip()`: senza questa bonifica quei viaggi resterebbero per sempre "in corso". |
| Chiave di percorso | `routeKey` = varchi attraversati in ordine, precalcolata alla chiusura | Rende il raggruppamento "Percorsi" una lettura di campo indicizzato invece di una ricostruzione dai checkpoint a ogni apertura dello storico. |
| Accesso facoltativo | Nessuna schermata è protetta; il profilo serve solo a dare identità ai dati | Un tachimetro che chiede di registrarsi prima di mostrare la velocità è un tachimetro rotto. L'utente di test è un profilo locale senza alcuna verifica di credenziali — e non deve averne, perché non c'è nulla da proteggere finché i dati non lasciano il device. |
| Login federati | `signInWithProvider` lancia un errore esplicito invece di simulare l'accesso | Sign in with Apple e Google restituiscono un token che **deve** essere verificato lato server contro le chiavi pubbliche del provider. Un finto login che crea un profilo locale darebbe l'illusione di un'identità verificata. Meglio un flusso predisposto e onestamente etichettato "prossimamente". |
| Coordinate live | Pattern **outbox**: si accoda sempre in locale con `syncState`, un adattatore drena | Permette di aggiungere il cloud senza toccare né il motore GPS né il registratore. `localOnlyAdapter` non invia nulla e non finge di farlo: la coda resta un archivio locale invece che una perdita di dati silenziosa. |
| Avatar | Emoji + colore, oppure foto ridimensionata a 128 px come data URL nel DB | Nessun CDN e nessun upload: l'avatar deve esserci anche in Airplane Mode. Una foto da fotocamera intatta gonfierebbe IndexedDB di megabyte per un'immagine mostrata a 72 px. |
| Hosting | **GitHub Pages** con base path `/navi` | Gratuito e già collegato al repository. Il sottopercorso però obbliga a rendere consapevoli del base path manifest, scope del service worker, icone e link interni: da qui l'helper `url()` in `src/lib/paths.ts`, unica fonte di verità per i percorsi. |
| `navigateFallback` senza barra finale | `/navi`, non `/navi/` | La home finisce in precache come `/navi`: legare il fallback a `/navi/` cercherebbe una chiave inesistente e **farebbe fallire ogni navigazione offline**. Trovato provando la build sotto il sottopercorso reale, non sarebbe emerso da un build verde. |
| `.nojekyll` | File vuoto in `public/` | GitHub Pages passa il sito da Jekyll, che scarta le cartelle con underscore: senza, `_astro/` — cioè tutto il JavaScript e il CSS — verrebbe rimosso dalla pubblicazione. |
| Isolamento dell'effect | `untracked(() => batch(() => onFix(fix)))` | `onFix` legge e riscrive gli stessi signal: senza `untracked` l'effect si auto-invalida ("Cycle detected") e **interrompe l'elaborazione a metà**, saltando del tutto il rilevamento dei varchi. |

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

### Fase 5: Motore Velocità Media ✅
- [x] Motore Tutor (`src/lib/tutor.ts`): rilevamento transito per **punto di massima vicinanza**, raggio di trigger 60 m
- [x] Apertura tratta al transito, accumulo distanza filtrata, media in tempo reale
- [x] Tratte **concatenate**: il varco che chiude una tratta apre subito la successiva
- [x] UI `AverageSpeedPanel`: media grande, limite, scarto ±, cronometro, km percorsi, orario e velocità di transito
- [x] Stati cromatici rispetto al limite: `ok` / `warn` (entro 5 km/h) / `over`
- [x] Riquadro di esito della tratta conclusa, visibile anche mentre la successiva è già in corso
- [x] Verifica end-to-end a 1 Hz (fix reali in autostrada): guida a 110 km/h → media **110**; a 150 km/h → media **150**, flag di superamento corretto

### Fase 6: Storico e Tracciamento Viaggi ✅
- [x] Schema DB v3: tabelle `trips` (Inizio-Fine), `checkpoints` (orario e velocità sotto ogni varco) e `segments` (tratte Tutor completate)
- [x] Registratore (`src/lib/recorder.ts`): un viaggio per sessione di tracking, distanza e velocità massima accumulate, checkpoint scritti subito
- [x] Chiusura automatica dei viaggi orfani lasciati aperti da sessioni interrotte
- [x] Modulo di lettura (`src/lib/history.ts`) con raggruppamento per **Giorni** e per **Percorsi** (chiave `routeKey` precalcolata)
- [x] Pagina `/storico` con le due viste, schede viaggio espandibili, eliminazione viaggio a cascata
- [x] Verifica end-to-end: 2 viaggi su 3 varchi → checkpoint con orari esatti e 140 km/h a ogni transito, 2 tratte per viaggio con media corretta, raggruppamento del percorso ripetuto, persistenza dopo reload

### Fase 7: Auth Mock e Modelli Social ✅
- [x] Schema DB v4: tabelle `profiles` (con Avatar) e `livePositions` (outbox coordinate live)
- [x] Autenticazione (`src/lib/auth.ts`): utente di test locale, sessione persistita, **nessuna schermata protetta**
- [x] Avatar: emoji + colore, oppure foto ridimensionata a 128 px e salvata come data URL nel DB (nessun CDN, funziona offline)
- [x] Architettura di sync (`src/lib/sync.ts`): interfaccia `SyncAdapter`, `localOnlyAdapter` di default, coda outbox con `syncState` e ciclo di drenaggio già scritto
- [x] Condivisione live opzionale e spenta di default, un punto ogni 10 s
- [x] Pagina `/profilo` con flussi Apple/Google predisposti ed etichettati "prossimamente"
- [x] Verifica end-to-end: le tre schermate principali restano accessibili senza account; profilo creato, rinominato e persistito; 3 posizioni accodate a intervalli di 10.0 s; sessione sopravvive al reload; uscire non tocca viaggi e varchi

---

## ✅ Roadmap completata

Tutte e 7 le fasi sono chiuse. L'app è una PWA installabile e offline-first che
misura la velocità GPS, riconosce i varchi Tutor censiti, calcola la media di
tratta e conserva lo storico dei viaggi, senza alcun backend.

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
- **Schema DB**: siamo alla `version(3)` in `src/lib/db.ts` (v1 fix/settings,
  v2 varchi, v3 viaggi/checkpoint/tratte). Nuove tabelle si aggiungono con una
  `.version(4).stores({...})`: Dexie migra da solo i database già sui device.
  Non modificare le versioni esistenti.
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
- Il registratore è **downstream** del motore Tutor: si limita a osservare i
  signal `lastFix`, `lastPass` e `lastCompleted` e a scriverli su IndexedDB.
  Il motore non sa che esiste, quindi resta testabile da solo.
- La **tratta in corso** vive ancora solo in memoria: se l'app viene chiusa a
  metà di una tratta Tutor, il viaggio viene chiuso correttamente (con i suoi
  checkpoint) ma la tratta aperta si perde. Persisterla richiederebbe di
  salvare `activeSegment` nei `settings` a ogni fix; valutare se ne vale il
  costo in scritture.
- `loadGatesIntoEngine()` va richiamata quando i varchi cambiano: oggi basta il
  mount della Dashboard perché `/varchi` è una pagina separata (navigare
  indietro rimonta l'island e ricarica i varchi).

## 🔭 Prossimi passi possibili (fuori roadmap)

Nessuno di questi è necessario: l'app è completa e funzionante così.

0. **Prova su strada** (il vero prossimo passo): installare la PWA sul telefono,
   censire un paio di varchi veri e guidare una tratta. Serve a validare il ramo
   Doppler mai eseguito e a ritarare le soglie su dati reali.
1. **Backend ExpressJS** per chiudere i due soli buchi che il browser non può
   colmare da solo: verifica dei token Apple/Google e ricezione delle posizioni
   live. Innesto: implementare `SyncAdapter` e sostituire il corpo di
   `signInWithProvider`. Nient'altro dell'app va toccato.
2. **Persistenza della tratta in corso**: oggi se l'app viene chiusa a metà di
   una tratta Tutor il viaggio si chiude correttamente ma la tratta aperta si
   perde. Si risolverebbe salvando `activeSegment` nei `settings`.
3. **Import/export dei varchi** (JSON o GPX) per condividere i censimenti fra
   utenti senza bisogno di un server.
4. **Rotta di traccia sulla mappa**: i fix sono già tutti in `db.fixes`, manca
   solo di disegnarli come polyline nello storico.
5. **Notifica di superamento**: avviso sonoro o aptico quando la media di
   tratta supera il limite, utile perché in auto non si guarda lo schermo.
