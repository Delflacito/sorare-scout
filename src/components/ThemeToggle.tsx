'use client';

import { useEffect, useState } from 'react';

export const THEME_KEY = 'sorare-scout:theme';

/** Bascule thème sombre (par défaut) / clair, mémorisée dans le navigateur. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.theme === 'light'), []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { window.localStorage.setItem(THEME_KEY, next ? 'light' : 'dark'); } catch { /* stockage indisponible */ }
  };
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={light} aria-label={light ? 'Passer au thème sombre' : 'Passer au thème clair'}>
      <span aria-hidden="true">{light ? '☾' : '☀'}</span>
    </button>
  );
}
