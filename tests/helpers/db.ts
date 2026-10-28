import postgres from 'postgres';
import { readdirSync } from 'node:fs';
import { createRepo, type Repo } from '@/db/repo';

export const TEST_DB_URL = process.env.DATABASE_URL_TEST;
export const describeDb = TEST_DB_URL ? describe : describe.skip;

/** Base de test vidée et migrée ; à appeler dans beforeEach. */
export async function freshDb(): Promise<{ sql: postgres.Sql; repo: Repo }> {
  const sql = postgres(TEST_DB_URL!, { onnotice: () => {} });
  await sql.unsafe('drop schema public cascade; create schema public;');
  for (const f of readdirSync('supabase/migrations').sort()) await sql.file(`supabase/migrations/${f}`);
  return { sql, repo: createRepo(sql) };
}
