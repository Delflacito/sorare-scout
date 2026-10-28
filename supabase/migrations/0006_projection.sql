-- Score potentiel : qualité défensive générale des équipes et forme des joueurs.
create table team_conceded_overall (
  team_id integer not null references teams(id),
  window_size integer not null,
  average double precision,
  league_average double precision,
  index double precision,
  observations integer not null,
  computed_at timestamptz not null default now(),
  primary key (team_id, window_size)
);
alter table team_conceded_overall enable row level security;
alter table player_summary add column form double precision;
