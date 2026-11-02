-- Historique hebdomadaire du ROI (investi, gains, valeur des cartes), une entrée par semaine, mise à jour à chaque visite.
alter table roi add column history jsonb not null default '[]';
