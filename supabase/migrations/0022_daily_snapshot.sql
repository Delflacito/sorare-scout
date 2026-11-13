-- Journal quotidien des signaux (prix, valeur estimée, score potentiel, projection Sorare) : permet de vérifier après coup
-- si une carte « sous-évaluée » a monté et si le score potentiel fait mieux que la projection officielle.
create table if not exists daily_snapshot (
  player_id integer not null references players(id) on delete cascade,
  day date not null,
  reference_price double precision not null,
  fair_price double precision,
  value_ratio double precision,
  next_fixture_id integer references fixtures(id) on delete set null,
  next_projected double precision,
  sorare_projection double precision,
  primary key (player_id, day)
);
alter table daily_snapshot enable row level security;
