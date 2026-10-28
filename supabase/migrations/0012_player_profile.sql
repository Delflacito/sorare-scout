-- Fiche joueur : actions décisives par match, identité, historique en championnat saison par saison.
alter table appearances add column decisive_actions jsonb not null default '{}';
-- Version du détail importé : les matchs complétés avant l'ajout des actions décisives (version 1) sont réimportés.
alter table fixtures add column stats_version integer not null default 1;

alter table players add column birth_date date;
alter table players add column country_code text;
alter table players add column country_name text;
alter table players add column country_flag_url text;
alter table players add column profile_updated_at timestamptz;

create table player_seasons (
  player_id integer not null references players(id) on delete cascade,
  start_year integer not null,
  appearances integer not null,
  substitute_in integer not null,
  goals integer not null,
  assists integer not null,
  minutes integer not null,
  yellow_cards integer not null,
  red_cards integer not null,
  primary key (player_id, start_year)
);
alter table player_seasons enable row level security;
