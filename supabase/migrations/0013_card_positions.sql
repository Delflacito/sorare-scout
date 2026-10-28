-- Postes où les cartes Sorare du joueur peuvent être alignées (ex. {Midfielder,Forward}).
alter table players add column card_positions text[];
