import postgres from 'postgres';

let instance: postgres.Sql | undefined;

/** Connexion partagée, créée à la première utilisation à partir de DATABASE_URL. */
export function getSql(): postgres.Sql {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL manquant');
    instance = postgres(url, { onnotice: () => {} });
  }
  return instance;
}
