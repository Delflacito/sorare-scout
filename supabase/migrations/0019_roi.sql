-- Saisies de la page ROI d'un manager (streaks, essence, cartes revendues), par championnat, rattachées à son pseudo Sorare.
create table roi (
  pseudo text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table roi enable row level security;
