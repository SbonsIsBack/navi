/**
 * Costruzione dei percorsi interni rispettando il base path.
 *
 * In sviluppo l'app vive sulla radice (`/`), su GitHub Pages sotto
 * `/navi/`. Scrivere `href="/varchi"` funzionerebbe solo nel primo caso:
 * in produzione porterebbe fuori dall'applicazione. `import.meta.env.BASE_URL`
 * è iniettato da Vite in fase di build e vale per entrambi gli ambienti.
 */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}
