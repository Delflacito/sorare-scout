-- Fiche joueur façon carte Sorare : prénom / nom, taille, numéro de maillot, photo détourée.
alter table players add column first_name text;
alter table players add column last_name text;
alter table players add column height integer;
alter table players add column shirt_number integer;
alter table players add column body_picture_url text;
