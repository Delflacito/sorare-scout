import Link from 'next/link';
import { getQueries } from '@/db/queries';

/** Pied de page : fraîcheur des données. Ne fait jamais échouer la page si la base est indisponible. */
export async function DataFooter() {
  let date: string | null = null;
  try {
    date = await getQueries().getLastSuccessfulImport();
  } catch {
    date = null;
  }
  return (
    <footer className="site">
      <span>
        {date
          ? `Données au ${new Date(date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' })}`
          : 'Données : date inconnue'}
      </span>
      {' · '}<Link href="/admin/imports">Suivi des imports</Link>
    </footer>
  );
}
