-- Cartes Limited du joueur : saison en cours ('in_season'), Classic seulement ('classic') ou aucune ('none').
alter table players add column if not exists card_status text check (card_status in ('in_season', 'classic', 'none'));

-- Scores des matchs récents au barème de chaque poste de carte (joueurs à plusieurs postes) : le barème Sorare diffère selon le poste.
create table if not exists position_scores (
  player_id integer not null references players(id) on delete cascade,
  fixture_id integer not null references fixtures(id) on delete cascade,
  position text not null check (position in ('Goalkeeper', 'Defender', 'Midfielder', 'Forward')),
  score double precision not null,
  decisive_score double precision not null default 0,
  all_around_score double precision not null default 0,
  primary key (player_id, fixture_id, position)
);
alter table position_scores enable row level security;
