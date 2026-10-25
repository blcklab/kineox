/** Kineox M4 theme contract. Optional and independent from playback. */
export type KineoxThemeName = 'dark' | 'light' | 'system' | 'minimal';

/** Semantic CSS tokens. All fields are optional and scoped to one mounted instance. */
export interface KineoxThemeTokens {
  readonly accent?: string;
  readonly foreground?: string;
  readonly muted?: string;
  readonly panel?: string;
  readonly outline?: string;
  readonly focusRing?: string;
  readonly radius?: string;
}

export interface KineoxThemeController {
  readonly element: HTMLElement;
  setTheme(theme: KineoxThemeName): void;
  setTokens(tokens: KineoxThemeTokens): void;
  /** Undo only the theme attributes/properties changed by this controller. */
  destroy(): void;
}

const tokenNames = {
  accent: '--kx-accent',
  foreground: '--kx-foreground',
  muted: '--kx-muted',
  panel: '--kx-panel',
  outline: '--kx-outline',
  focusRing: '--kx-focus',
  radius: '--kx-radius'
} as const;
const themeNames = ['dark', 'light', 'system', 'minimal'];

/**
 * DOM-only presentation helper. This does not import any CSS or playback module.
 * Tokens intentionally accept CSS values, but never concatenate them into HTML.
 */
export function createKineoxTheme(
  element: HTMLElement,
  options: { readonly theme?: KineoxThemeName; readonly tokens?: KineoxThemeTokens } = {}
): KineoxThemeController {
  if (!element || element.nodeType !== 1 || !element.style || !element.dataset) {
    throw new TypeError('Kineox theme target must be an HTMLElement.');
  }
  const priorTheme = element.getAttribute('data-kx-theme');
  const originals = new Map<string, { value: string; priority: string }>();
  let alive = true;
  const aliveCheck = () => { if (!alive) throw new Error('Kineox theme controller was destroyed.'); };
  function setTheme(theme: KineoxThemeName): void {
    aliveCheck();
    if (!themeNames.includes(theme)) throw new TypeError(`Unsupported Kineox theme: ${String(theme)}`);
    element.dataset.kxTheme = theme;
  }
  function setTokens(tokens: KineoxThemeTokens): void {
    aliveCheck();
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
      throw new TypeError('Theme tokens must be an object.');
    }
    // Validate the whole patch before mutating the DOM; null clears an override too.
    const entries = Object.entries(tokens);
    for (const [key, value] of entries) {
      if (!(key in tokenNames) || !(value === null || (typeof value === 'string' && value.length <= 240))) {
        throw new TypeError(`Invalid Kineox theme token: ${key}`);
      }
    }
    for (const [key, value] of entries) {
      const cssName = tokenNames[key as keyof KineoxThemeTokens];
      if (!originals.has(cssName)) originals.set(cssName, {
        value: element.style.getPropertyValue(cssName), priority: element.style.getPropertyPriority(cssName)
      });
      if (value === null || value === '') element.style.removeProperty(cssName);
      else element.style.setProperty(cssName, value as string);
    }
  }
  if (options.theme !== undefined) setTheme(options.theme);
  if (options.tokens !== undefined) setTokens(options.tokens);
  return {
    element, setTheme, setTokens,
    destroy() {
      if (!alive) return;
      alive = false;
      if (priorTheme === null) element.removeAttribute('data-kx-theme');
      else element.setAttribute('data-kx-theme', priorTheme);
      for (const [name, old] of originals) {
        if (old.value) element.style.setProperty(name, old.value, old.priority);
        else element.style.removeProperty(name);
      }
      originals.clear();
    }
  };
}
