-- Moyennes Sorare sur les x derniers matchs joués (toutes saisons et compétitions), lues chez Sorare.
-- Idempotent : l'import quotidien l'exécute à chaque démarrage.
create table if not exists player_averages (
  player_id integer primary key references players(id) on delete cascade,
  l5 double precision,
  l10 double precision,
  l15 double precision,
  l20 double precision,
  l50 double precision,
  played integer not null,
  updated_at timestamptz not null default now()
);
