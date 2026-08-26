# Navi — Tutor & Average Speed Tracker

PWA offline-first che misura la velocità GPS istantanea, riconosce i varchi
Tutor censiti e calcola la velocità media di tratta, conservando lo storico dei
viaggi. Tutto avviene sul device: nessun backend, nessuna connessione richiesta.

**App pubblicata:** https://sbonsisback.github.io/navi/

## Provarla sul telefono

1. Apri il link qui sopra da Chrome (Android) o Safari (iOS).
2. Installala sulla home: *Aggiungi a schermata Home* dal menu del browser.
3. Apri l'app installata e premi **AVVIA TRACKING**, concedendo il permesso di
   posizione. Per il tracking in auto conviene concedere la posizione
   "sempre" o "durante l'uso" con precisione elevata.

> La geolocalizzazione e i service worker richiedono HTTPS: l'app funziona dal
> link pubblicato o da `localhost`, non aprendo i file direttamente né via IP
> locale in HTTP.

### Primo giro consigliato

1. **Censisci i varchi**: sezione *Varchi*. Il modo più preciso è premere il
   grande pulsante centrale passando fisicamente sotto il varco; in
   alternativa si inseriscono le coordinate a mano o si tocca la mappa.
   Ripassando sotto lo stesso varco la posizione viene affinata invece di
   creare un doppione.
2. Imposta il **limite della tratta** sul varco d'ingresso (es. 130): serve a
   colorare la media quando la superi.
3. **Guida**: passando sotto il primo varco parte la tratta e la media compare
   sotto il tachimetro. Al varco successivo la tratta si chiude e appare il
   verdetto.
4. **Storico**: viaggi raggruppati per giorni o per percorsi ripetuti, con
   orario e velocità a ogni transito.

## Sviluppo

```bash
npm install
npm run dev      # server di sviluppo su localhost (GPS e PWA funzionanti)
npm run build    # build di produzione in dist/
npm run preview  # serve la build, per provare service worker e offline
npm run icons    # rigenera le icone PWA in public/icons/
```

Il pannello **Diagnostica** in fondo alla schermata principale permette di
simulare la velocità con uno slider o una guida demo, senza muoversi.

## Stack

Astro 5 (output statico) con island Preact, `@vite-pwa/astro` per manifest e
service worker, Dexie su IndexedDB per lo storage offline, Leaflet per la
mappa dei varchi. Nessun backend.

## Documentazione

[`STATE.md`](./STATE.md) è il documento di riferimento del progetto: contiene la
roadmap completa, le decisioni architetturali con le relative motivazioni, i
limiti noti e i possibili sviluppi futuri.
