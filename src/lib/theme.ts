// Theme: explicit "light" | "dark" in localStorage, otherwise the OS setting. Applied before paint.
export const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})()`
export function setTheme(t: 'light' | 'dark') {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem('theme', t) } catch { /* private mode */ }
}
export const currentTheme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
