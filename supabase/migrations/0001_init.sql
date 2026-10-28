create table competitions (
  id integer generated always as identity primary key,
  slug text not null unique,
  name text not null,
  apifootball_id integer unique
);

create table teams (
  id integer generated always as identity primary key,
  name text not null,
  sorare_slug text not null unique,
  apifootball_id integer unique,
  competition_id integer references competitions(id)
);

create table players (
  id integer generated always as identity primary key,
  name text not null,
  sorare_slug text not null unique,
  apifootball_id integer unique,
  position text check (position in ('Goalkeeper', 'Defender', 'Midfielder', 'Forward')),
  team_id integer references teams(id)
);

create table fixtures (
  id integer generated always as identity primary key,
  date timestamptz not null,
  competition_id integer not null references competitions(id),
  home_team_id integer not null references teams(id),
  away_team_id integer not null references teams(id),
  home_goals integer,
  away_goals integer,
  status text not null check (status in ('played', 'scheduled', 'postponed')),
  sorare_game_id text not null unique,
  apifootball_fixture_id integer unique,
  home_formation text,
  away_formation text,
  lineups_imported boolean not null default false
);
create index fixtures_home_date on fixtures (home_team_id, date desc);
create index fixtures_away_date on fixtures (away_team_id, date desc);

create table appearances (
  fixture_id integer not null references fixtures(id) on delete cascade,
  player_id integer not null references players(id),
  team_id integer not null references teams(id),
  grid text,
  detailed_position text check (detailed_position in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST')),
  started boolean not null,
  minutes integer not null default 0,
  sorare_score double precision not null default 0,
  decisive_score double precision not null default 0,
  all_around_score double precision not null default 0,
  primary key (fixture_id, player_id)
);
create index appearances_player on appearances (player_id);

create table unmatched_players (
  id integer generated always as identity primary key,
  source text not null check (source in ('sorare', 'apifootball')),
  external_id text not null,
  name text not null,
  club text,
  fixture_id integer references fixtures(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique nulls not distinct (source, external_id, fixture_id)
);

create table team_conceded_by_position (
  team_id integer not null references teams(id),
  detailed_position text not null check (detailed_position in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST')),
  window_size integer not null,
  average double precision,
  league_average double precision,
  index double precision,
  observations integer not null,
  low_sample boolean not null,
  computed_at timestamptz not null default now(),
  primary key (team_id, detailed_position, window_size)
);

create table player_summary (
  player_id integer primary key references players(id),
  l5 double precision not null,
  l15 double precision not null,
  l40 double precision not null,
  std_dev5 double precision not null,
  start_rate5 double precision not null,
  avg_minutes5 double precision not null,
  start_rate15 double precision not null,
  avg_minutes15 double precision not null,
  decisive5 double precision not null,
  all_around5 double precision not null,
  decisive15 double precision not null,
  all_around15 double precision not null,
  usual_position text check (usual_position in ('GK','LB','CB','RB','LWB','RWB','DM','CM','AM','LW','RW','ST')),
  computed_at timestamptz not null default now()
);

create table import_runs (
  id integer generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'ok', 'error', 'quota_exhausted')),
  fixtures_imported integer not null default 0,
  errors jsonb not null default '[]'
);
