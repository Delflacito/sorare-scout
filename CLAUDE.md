# Consignes pour Claude

- Répondre et écrire (commits, textes du site) en français.
- Publier directement sur `main` dès que `npm run typecheck` et `npm test` passent : Vercel déploie `main` en production.
  Avant de pousser, intégrer ce qui a été poussé sur `main` entre-temps (`git fetch origin main` puis merge), relancer les tests.
- Projet Vercel : `sorare-scout` (équipe `delflacito`) ; vérifier que le déploiement de production est `READY` après un push.
