# STATE.md — Navi (Tutor & Average Speed Tracker)

> **File di standoff.** Fonte di verità per riprendere il contesto tra sessioni.
> Protocollo: al comando "Riprendi dallo standoff" → leggere questo file, analizzare
> l'ultimo commit, riassumere lo stato e attendere l'"Ok" prima di procedere.

## 📌 Task attualmente in lavorazione

**Nessuno.** Fase 1 completata; in attesa di autorizzazione per iniziare la Fase 2
(Theming Engine e UI Core).

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

## 🗺️ Roadmap

### Fase 1: Inizializzazione, PWA e Standoff ✅
- [x] Dichiarazione e motivazione dello stack (Astro 5 + Preact + @vite-pwa/astro)
- [x] Progetto base inizializzato (layout, pagina placeholder, stile fondazione dark)
- [x] Manifest configurato (nome, icone 192/512/maskable, standalone, portrait, theme color)
- [x] Service Worker Workbox: precache completa output, `navigateFallback: '/'`, autoUpdate
- [x] Registrazione SW nel layout (`virtual:pwa-register`)
- [x] Creazione `STATE.md` e primo commit di setup

### Fase 2: Theming Engine e UI Core ⬜
- [ ] Layout principale + context/store globale per la gestione dei temi (switchabile, estendibile)
- [ ] Mock della velocità (slider/random generator) per testare la UI senza GPS
- [ ] Tachimetro **Analogico** (lancetta fluida)
- [ ] Tachimetro **Digitale** (numeri grandi, font moderno minimalista)
- [ ] Tachimetro **Retro Digital Dashboard** (dark anni '90-2000, barrette verdi luminescenti)

### Fase 3: Core GPS Tracker e Database Offline ⬜
- [ ] Setup Dexie/IndexedDB per storage persistente client
- [ ] Collegamento Web Geolocation API (`watchPosition`) alla UI
- [ ] Calcolo velocità istantanea con smoothing (evitare sbalzi)

### Fase 4: Gestione Varchi e Normalizzazione ⬜
- [ ] UI inserimento Tutor: coordinate manuali, click su mappa, GRANDE PULSANTE cattura GPS
- [ ] Salvataggio varchi su IndexedDB
- [ ] Algoritmo anti-cloni (merge/media posizioni entro raggio 5-6 m)

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

## 🛠️ Comandi

- `npm run dev` — dev server
- `npm run build` — build produzione (genera anche `sw.js` e `manifest.webmanifest`)
- `npm run preview` — serve la build (per testare la PWA/offline)
- `npm run icons` — rigenera le icone PNG in `public/icons/`

## 📝 Note per la prossima sessione

- La PWA è installabile e apre offline dopo la prima visita (precache Workbox).
- `devOptions.enabled: false`: il SW è attivo solo in build/preview, non in dev.
- I token CSS in `Layout.astro` (`--color-*`, `--font-ui`) sono le fondamenta minime:
  in Fase 2 verranno promossi a vero Theming Engine (temi: Analogico, Digitale, Retro).
