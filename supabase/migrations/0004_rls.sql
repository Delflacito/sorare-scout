-- Le site et l'import se connectent directement à Postgres (rôle propriétaire, non soumis au RLS).
-- RLS activé sans politique : les tables ne sont pas accessibles via l'API publique de Supabase (clé anon).
alter table competitions enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table fixtures enable row level security;
alter table appearances enable row level security;
alter table unmatched_players enable row level security;
alter table team_conceded_by_position enable row level security;
alter table player_summary enable row level security;
alter table import_runs enable row level security;
