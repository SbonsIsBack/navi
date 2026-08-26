/**
 * Wake Lock: tiene acceso lo schermo durante il tracking. Un tachimetro che
 * si spegne dopo 30 secondi sarebbe inutile in auto.
 *
 * L'API non è disponibile ovunque e il lock viene rilasciato dal sistema
 * quando la pagina passa in background: lo riacquisiamo al ritorno.
 */

let sentinel: WakeLockSentinel | null = null;
let listening = false;

async function acquire(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Batteria bassa o permesso negato: il tracking prosegue comunque.
    sentinel = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && sentinel === null && listening) {
    void acquire();
  }
}

export async function requestWakeLock(): Promise<void> {
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  await acquire();
}

export async function releaseWakeLock(): Promise<void> {
  listening = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  try {
    await sentinel?.release();
  } catch {
    // Già rilasciato dal sistema.
  }
  sentinel = null;
}
