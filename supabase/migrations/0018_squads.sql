-- Effectif « Mon effectif » d'un manager, rattaché à son pseudo Sorare (même effectif sur tous ses appareils).
create table squads (
  pseudo text primary key,
  entries jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table squads enable row level security;
