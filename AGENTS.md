# Ambux — consignes pour les agents

Ambux est une démo dans le navigateur pour préparer le planning du lendemain d'une société de transport sanitaire. Journée type autour de Rouen, patients et équipages fictifs, régulateur démo Noam Keller, date de mission 2026-10-16. Aucun serveur métier. Le brouillon reste dans ce navigateur.

## Carte

- `src/main.tsx`, `src/App.tsx` : entrée, accueil, navigation.
- `src/game/types.ts` : types et règles par défaut (amplitude, repas, charges, tolérance).
- `src/game/schedule.ts` : créneaux, `snap5`, `ceil5`, simulation ancrée. Les invariants sont dans `.cursor/rules/scheduler.mdc`.
- `src/game/reducer.ts` : seul magasin. Les vues passent par `dispatch`.
- `src/game/optimizer.ts`, `generate.ts`, `baseline.ts` : génération, planning initial, gain.
- `src/game/imprevus.ts`, `src/components/imprevus/` : absences, appel tardif, épingle, régénération.
- `src/game/lomaco.ts` : import et export par fichier, sans API.
- `src/components/planning/` : timeline, carte, À placer. Les gestes (`PlanningWorkspace.tsx`, `GanttBoard.tsx`, `drag.ts`, CSS des blocs) appartiennent à l'intégrateur.
- `src/components/WorkViews.tsx` : Réglages (rubrique Données) et Synthèse (gain).
- `e2e/` : Playwright sur Chrome, 390×844 et 1440×900. `scripts/*.test.ts` : règles. `npm run sim` est un contrôle à part, hors CI.

## Branches

Elles s'ouvrent vers `main`. L'intégrateur fusionne. Une PR rouge ne se fusionne pas.

- `qa/journee-regulateur` : règles, imports, parcours Gantt.
- `ux/donnees-menu` : menu court, Données dans Réglages, journée type, carte de gain.
- `feat/imprevus` : absences, ajouts tardifs, réoptimisation, épingles.
- `feat/v0.8-gantt-tactile` : gestes de la timeline.
- `chore/cursor-setup` : gouvernance (ce document, règles Cursor, CI).

## Règles

- Ne jamais pousser `stable`. Ne jamais créer, déplacer ou supprimer un tag. La publication est une décision à part, dans `CONTRIBUTING.md`.
- Données fictives seulement. Pas de nom, d'adresse, de téléphone ou de dossier réel.
- Interface mobile d'abord, courte. Pas de dépendance lourde si le dépôt sait déjà faire.
- Ne jamais écrire qu'un test est passé s'il n'a pas été lancé. Chrome via Playwright n'est pas un iPhone.
- Comptes rendus en français : problèmes, causes, fichiers, choix, tests réellement lancés, régressions, limites, étape suivante.
- Toute PR vers `main` (QA, UX, métier, Gantt) doit passer l'intégration continue : typecheck, lint, Prettier, unitaires, build, Playwright.
