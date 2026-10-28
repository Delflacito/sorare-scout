-- Présent : statut de jeu, blessures, suspensions et projection Sorare du prochain match ; photos et logos.
alter table teams add column picture_url text;
alter table teams add column short_name text;
alter table players add column picture_url text;
alter table players add column playing_status text;
alter table players add column injury_kind text;
alter table players add column injury_end date;
alter table players add column suspension_reason text;
alter table players add column suspension_end date;
alter table players add column sorare_projection double precision;
alter table players add column status_updated_at timestamptz;
