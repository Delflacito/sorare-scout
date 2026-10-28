/** Lieu du match : pastille D (domicile) ou E (extérieur), couleurs distinctes et libellé complet au survol. */
export function Venue({ isHome }: { isHome: boolean }) {
  const label = isHome ? 'Domicile' : 'Extérieur';
  return (
    <abbr className={`venue ${isHome ? 'home' : 'away'}`} title={label} aria-label={label}>
      {isHome ? 'D' : 'E'}
    </abbr>
  );
}
