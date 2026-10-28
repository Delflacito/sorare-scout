-- Tous les matchs des joueurs : coupes d'Europe, coupes nationales et sélections.
-- Seuls les championnats (is_league) entrent dans le concédé, la qualité adverse et l'avantage du terrain.
alter table competitions add column is_league boolean not null default true;
alter table teams add column kind text not null default 'club' check (kind in ('club', 'national'));
alter table players add column national_team_id integer references teams(id);
