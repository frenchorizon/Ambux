# Ambux — consignes pour les agents

Ambux est une démo de régulation de transport sanitaire, dans le navigateur. Les patients, adresses et équipages sont fictifs (journée type autour de Rouen, régulateur démo Noam Keller). Aucune donnée réelle.

## Carte

- `src/game/` : état, solveur (`schedule.ts`, `reducer.ts`), import Lomaco, imprévus, historique.
- `src/components/planning/` : timeline Gantt, gestes, croix directionnelle. Les gestes appartiennent à l'intégrateur.
- `src/components/imprevus/` : absences, appel tardif, épingle, régénération incrémentale.
- `e2e/` : Playwright (téléphone 390×844 et bureau). `scripts/*.test.ts` : règles unitaires.
- Branches d'équipe : `qa/journee-regulateur`, `ux/donnees-menu`, `feat/imprevus`, `feat/v0.8-gantt-tactile`. Elles s'ouvrent vers `main`.

## Règles

- Ne jamais pousser `stable` ni déplacer un tag. Les tags existants restent en place.
- Données fictives seulement. Pas de nom, d'adresse ou de dossier réel.
- Interface mobile d'abord, petite et lisible. Pas de dépendance lourde pour une fonction déjà couverte.
- Ne jamais écrire qu'un test est passé s'il n'a pas été lancé.
- Les comptes rendus à l'équipe sont en français : problèmes, causes, fichiers, choix, tests réels, régressions, limites, étape suivante.
- Une PR vers `main` doit passer l'intégration continue (typecheck, lint, unitaires, build, Playwright).
