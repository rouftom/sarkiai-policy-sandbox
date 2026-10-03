/**
 * Browser-chrome theming (ported from the SarkiAI theme charter).
 * Pushes the active theme pack + mode onto the theme-color metas, the app tile
 * and the OS color scheme, pre-paint, so there is no flash on first load.
 */

export type ThemeMode = 'light' | 'dark'

export interface ThemePack {
  id: string
  label: string
  colors: { light: string; dark: string; primaryLight?: string; primaryDark?: string }
}

export const THEME_PACKS: ThemePack[] = [
  { id: 'governance', label: 'Governance', colors: { light: '#0f766e', dark: '#0b1220', primaryLight: '#0f766e', primaryDark: '#14b8a6' } },
  { id: 'diplomacy', label: 'Diplomacy', colors: { light: '#1d4ed8', dark: '#0a1128', primaryLight: '#1d4ed8', primaryDark: '#60a5fa' } },
  { id: 'health', label: 'Health', colors: { light: '#059669', dark: '#06140e', primaryLight: '#059669', primaryDark: '#34d399' } },
  { id: 'alerts', label: 'Alerts', colors: { light: '#dc2626', dark: '#1a0a0a', primaryLight: '#dc2626', primaryDark: '#f87171' } },
]

export const THEME_STORAGE_KEY = 'sps-theme-pack'
export const MODE_STORAGE_KEY = 'sps-theme-mode'

export function resolveMode(preferred?: string | null): ThemeMode {
  if (preferred === 'dark') return 'dark'
  if (preferred === 'light') return 'light'
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function applyThemePack(packId: string, mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const pack = THEME_PACKS.find((p) => p.id === packId) ?? THEME_PACKS[0]!
  const root = document.documentElement
  root.setAttribute('data-theme-pack', pack.id)
  root.classList.toggle('dark', mode === 'dark')

  const color = mode === 'dark' ? pack.colors.dark : pack.colors.light
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)

  const scheme = document.head.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (scheme) scheme.setAttribute('content', mode)
}

export function readStoredTheme(): { packId: string; mode: ThemeMode } {
  if (typeof window === 'undefined') return { packId: 'governance', mode: 'light' }
  const packId = localStorage.getItem(THEME_STORAGE_KEY) ?? 'governance'
  const mode = resolveMode(localStorage.getItem(MODE_STORAGE_KEY))
  return { packId, mode }
}

/** Inline pre-paint script, embedded in the root layout. */
export function buildThemeBootstrapScript(): string {
  const byId = Object.fromEntries(THEME_PACKS.map((p) => [p.id, p.colors]))
  return `(function(){try{
var map=${JSON.stringify(byId)};
var id=localStorage.getItem('${THEME_STORAGE_KEY}')||'governance';
var mode=localStorage.getItem('${MODE_STORAGE_KEY}')||'system';
var dark=mode==='dark'||(mode!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var root=document.documentElement;
root.setAttribute('data-theme-pack',id);
if(dark)root.classList.add('dark');else root.classList.remove('dark');
var c=(map[id]||map['governance']);
var color=dark?c.dark:c.light;
var m=document.head.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',color);
}catch(e){}})();`
}
