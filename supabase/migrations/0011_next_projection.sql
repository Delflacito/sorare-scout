-- Score potentiel du prochain match de championnat, calculé à chaque import (tri de l'explorateur, Ma Game Week).
alter table player_summary add column next_fixture_id integer references fixtures(id) on delete set null;
alter table player_summary add column next_projected double precision;
create index player_summary_next on player_summary (next_fixture_id);
