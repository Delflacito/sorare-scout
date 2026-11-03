-- Sélections enregistrées de la page Streak (joueurs choisis match par match), rattachées au pseudo Sorare.
create table streak_plans (
  pseudo text primary key,
  plans jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table streak_plans enable row level security;
