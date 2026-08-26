import { THEMES, themeId, setTheme, type ThemeId } from '@/lib/themes';

/** Selettore a segmenti dei temi registrati. Si estende da solo col registro. */
export function ThemeSwitcher() {
  const current = themeId.value;
  return (
    <div class="theme-switcher" role="radiogroup" aria-label="Tema">
      {(Object.keys(THEMES) as ThemeId[]).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          class={current === id ? 'theme-btn theme-btn--active' : 'theme-btn'}
          onClick={() => setTheme(id)}
        >
          {THEMES[id].label}
        </button>
      ))}
    </div>
  );
}
