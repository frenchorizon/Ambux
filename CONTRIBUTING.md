# Contribuer

Les branches d'équipe (`qa/journee-regulateur`, `ux/donnees-menu`, `feat/imprevus`, `feat/v0.8-gantt-tactile`, et les suivantes) s'ouvrent vers `main`.

Une PR ne se fusionne que si l'intégration continue est verte. Cela vaut pour toutes les PR des autres agents. Le contrôle lance le typecheck, le lint, Prettier, les tests unitaires, le build et Playwright (Chrome, téléphone 390×844 et bureau). Une PR rouge reste ouverte.

On ne pousse pas `stable` depuis une branche de travail. On ne crée pas, on ne déplace pas et on ne supprime pas un tag dans une PR.

## Vérifier en local

```bash
npm install
npm run check
npm run test:unit
npm test
```

- `npm run check` : TypeScript strict, oxlint, ESLint, Prettier.
- `npm run test:unit` : règles dans `scripts/*.test.ts`.
- `npm test` : unitaires, puis Playwright.
- `npm run e2e` : navigateur seul. Le serveur de dev est `npm run dev` (port 5280).

## Publier

La publication n'est pas une PR. Elle se décide sur `main` quand les branches prévues sont intégrées et que `npm run check` puis `npm test` sont verts.

1. Décrire le palier en français dans `CHANGELOG.md`.
2. Poser un tag annoté sur le commit de `main` : `git tag -a vX.Y.Z -m "Ambux vX.Y.Z"`.
3. Pousser `main`, puis le tag.
4. Avancer `stable` en fast-forward jusqu'à ce tag, et seulement jusqu'à ce tag. `stable` ne reçoit pas de commit direct.
5. Copier le HTML autonome dans `/opt/cursor/artifacts/releases/ambux-vX.Y.Z.html`.

Le détail des versions déjà livrées est dans `RELEASES.md`.

## Revenir en arrière

1. Ne pas réécrire, déplacer ou supprimer un tag déjà publié.
2. Pour retirer une fusion de `main` : `git revert -m 1 <commit-de-fusion>`, puis `npm test`.
3. `stable` continue de pointer sur le dernier tag accepté. On ne l'avance pas pour rattraper un `main` cassé.
4. Pour reconstruire une version figée sans la modifier : `git fetch origin --tags`, puis `git checkout vX.Y.Z`, `npm install`, `npm run build`. Le checkout d'un tag détache `HEAD` : aucun commit n'y est ajouté.
5. Sans recompiler, ouvrir `/opt/cursor/artifacts/releases/ambux-vX.Y.Z.html`.
