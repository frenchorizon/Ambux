# Contribuer

Les branches d'équipe s'ouvrent vers `main`. L'intégration continue doit être verte : typecheck, lint, Prettier, tests unitaires, build, Playwright.

## Vérifier en local

```bash
npm install
npm run check
npm test
```

`npm run e2e` relance seulement le navigateur. Le serveur de dev est `npm run dev` (port 5280).

## Publier

1. Fusionner dans `main` seulement si `npm run check` et `npm test` passent.
2. Le tag annoté et la branche `stable` ne se déplacent pas depuis une PR. Une publication est décidée à part, quand toutes les branches prévues sont intégrées.
3. Le journal des versions (`CHANGELOG.md`) décrit le palier en français.

## Revenir en arrière

1. Ne pas réécrire un tag déjà publié.
2. Pour retirer une fusion : `git revert -m 1 <commit-de-fusion>` sur `main`, puis `npm test`.
3. `stable` continue de pointer sur le dernier tag laissé en place. On n'y pousse pas pour « rattraper » `main`.
