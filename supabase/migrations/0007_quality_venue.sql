-- Note de qualité défensive (1 à 100) et avantage du terrain mesuré par championnat.
alter table team_conceded_overall add column rating integer;
create table venue_factors (
  competition_id integer primary key references competitions(id),
  home_factor double precision not null,
  away_factor double precision not null,
  observations integer not null,
  computed_at timestamptz not null default now()
);
alter table venue_factors enable row level security;
