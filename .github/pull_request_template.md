## Quoi

## Pourquoi

## Comment vérifier

- [ ] `npm run check`
- [ ] `npm run test:unit`
- [ ] `npm test` (unitaires et Playwright) si l'interface ou le solveur change
- [ ] L'intégration continue est verte (typecheck, lint, unitaires, build, Playwright)

## Garde-fous

- [ ] Données fictives seulement. Aucun patient, téléphone ou dossier réel.
- [ ] Cette PR ne pousse pas `stable` et ne crée, ne déplace ni ne supprime un tag.
- [ ] Les tests cités ont été lancés. Chrome via Playwright n'est pas un iPhone.
