-- Marché des cartes Limited : prix planchers, dernières ventes, valeur estimée et potentiel avant la Game Week.
alter table players add column floor_in_season double precision;
alter table players add column floor_classic double precision;
alter table players add column market_updated_at timestamptz;

create table card_sales (
  player_id integer not null references players(id) on delete cascade,
  sold_at timestamptz not null,
  price_eur double precision not null,
  in_season boolean not null,
  primary key (player_id, sold_at, price_eur)
);
create index card_sales_player_date on card_sales (player_id, sold_at desc);
alter table card_sales enable row level security;

-- Calculé après chaque import : prix de référence (carte de la saison), valeur estimée d'après les performances,
-- prix potentiel si le joueur marque son score potentiel au prochain match.
create table player_market (
  player_id integer primary key references players(id) on delete cascade,
  reference_price double precision not null,
  recent_price double precision,
  price_trend7 double precision,
  sales30 integer not null,
  fair_price double precision,
  value_ratio double precision,
  potential_price double precision,
  potential_gain double precision,
  computed_at timestamptz not null default now()
);
alter table player_market enable row level security;
