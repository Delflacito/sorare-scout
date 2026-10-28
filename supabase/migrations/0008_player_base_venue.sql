-- Score potentiel : niveau de base (L15 sur les matchs joués) et moyennes du joueur à domicile / à l'extérieur.
alter table player_summary add column base double precision;
alter table player_summary add column home_avg double precision;
alter table player_summary add column home_games integer not null default 0;
alter table player_summary add column away_avg double precision;
alter table player_summary add column away_games integer not null default 0;
