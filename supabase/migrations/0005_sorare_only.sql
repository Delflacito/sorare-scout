-- Données 100 % Sorare : plus d'API-Football ni de rapprochement de joueurs.
drop table if exists unmatched_players;
alter table competitions drop column if exists apifootball_id;
alter table teams drop column if exists apifootball_id;
alter table players drop column if exists apifootball_id;
alter table fixtures drop column if exists apifootball_fixture_id;
alter table import_runs drop constraint if exists import_runs_status_check;
update import_runs set status = 'ok' where status = 'quota_exhausted';
alter table import_runs add constraint import_runs_status_check check (status in ('running', 'ok', 'error'));
