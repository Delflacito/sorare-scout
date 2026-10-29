-- Ventes aux enchères (TokenAuction) distinguées des ventes de managers et des ventes primaires.
alter table card_sales add column auction boolean not null default false;
