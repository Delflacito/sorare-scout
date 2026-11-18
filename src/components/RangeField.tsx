'use client';

import { useState } from 'react';

/** Curseur 0–100 d'un formulaire GET, avec sa valeur affichée. */
export function RangeField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  const [v, setV] = useState(defaultValue);
  return (
    <label className="range-field">
      <span>{label} <output>{v}</output></span>
      <input type="range" name={name} min={0} max={100} step={1} value={v} onChange={(e) => setV(Number(e.target.value))} />
    </label>
  );
}
