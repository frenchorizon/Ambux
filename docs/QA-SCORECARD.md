# Scorecard QA — journée du régulateur

Mesure du 16 octobre 2026, branche `qa/journee-regulateur`, révision exercée `7fd3451`.

**Score : 38 / 40 = 95 %.**

Même grille de 40 contrôles. 15 courses ambulance et 25 courses VSL sont un exemple de journée chargée, pas une limite : le solveur, la revue et le geste ne les refusent plus. Une attente saisie (kiné 45 min, dialyse 4 h, consultation 30 min) crée ou met à jour le retour : prise en charge = arrivée de l'aller + attente, calée sur 5 minutes. Les deux échecs restants sont la grille de 5 minutes affichée et l'attente sur la timeline téléphone (`GanttBoard` / `PlanningWorkspace`, laissés au lead).

## Comment c'est mesuré

- Navigateur : Google Chrome du système, Playwright `channel: chrome`, locale `fr-FR`. Pas d'iPhone physique.
- Téléphone émulé : 390×844. Bureau : 1440×900.
- Application : `npm run dev` sur `http://127.0.0.1:5280`.
- Bout en bout : `npx playwright test e2e/journee-regulateur.spec.ts` — **19 passés, 1 ignoré, 0 échec, 26,5 s**. L'ignoré est le menu latéral sur le projet téléphone : cette barre n'existe qu'au bureau.
- Unitaire ce run : `scripts/schedulerRules.test.ts` et `scripts/rules.test.ts` — **36/36**. Lomaco et segments (14 tests) n'ont pas été relancés : ces fichiers n'ont pas changé.
- Le routage des gestes Gantt est forcé en estimation (`ambux.routing=estimate`) pour que le temps affiché ne bouge pas sous un aller-retour OSRM. Les tuiles et le secours de routage sont testés à part, réseau réel.

Aucun fichier de `src/components/planning/` n'a été modifié. Dans `schedule.ts` et `reducer.ts`, le plafond de charge a été retiré et le retour de séance ajouté à côté de `state.rules`, pour rester fusionnable avec `feat/imprevus`.

## Contrôles

| # | Contrôle | Résultat | Preuve |
| --- | --- | --- | --- |
| 1 | CSV courses : aller et retour acceptés et reliés | PASS | e2e import, téléphone et bureau |
| 2 | CSV : rejet d'une date hors jour et d'une heure invalide | PASS | e2e import |
| 3 | XLSX : véhicule, équipage et course acceptés | PASS | e2e import |
| 4 | XLSX : rejets heure, plaque trop courte, équipage introuvable | PASS | e2e import |
| 5 | CSV véhicules : rejets plaque et type, ligne acceptée | PASS | e2e import |
| 6 | CSV équipages : rejet véhicule inconnu, ligne acceptée | PASS | e2e import |
| 7 | Renommer un patient | PASS | e2e import |
| 8 | Ajouter un véhicule | PASS | e2e import |
| 9 | Ajouter un conducteur et l'affecter | PASS | e2e import |
| 10 | Générer le planning | PASS | e2e règles + journée chargée |
| 11 | Pause repas 11:00–14:30, 30 min, une par équipage, aucun « Pause repas manquante » | PASS | e2e règles + unitaire |
| 12 | Amplitude 11 h, prises de poste décalées, bornée 06:00–20:00 | PASS | e2e règles + unitaire |
| 13 | Réglages : tolérance 20 min, amplitude 11 h, séance 4 h, aucun plafond de charge | PASS | e2e règles |
| 14 | Tap Gantt : heure prévue = rendez-vous, RDV d'origine visible | PASS | e2e Gantt |
| 15 | D-pad +5 min sur une course qui reste alignée, puis Annuler, Rétablir, Ctrl+Z | PASS | e2e Gantt |
| 16 | D-pad : changement de véhicule, puis Annuler | PASS | e2e Gantt |
| 17 | Refus allongé vers un VSL, au D-pad et au glisser | PASS | e2e Gantt (souris au bureau, pointeur synthétique au téléphone) |
| 18 | Séance 09:30 + attente 45 min : retour à 10:15, « attente 45 min » dans la demande | PASS | e2e import, téléphone et bureau |
| 19 | Séries récurrentes ajoutées une seule fois | PASS | e2e séries |
| 20 | Changement de date, Annuler, Rétablir | PASS | e2e séries |
| 21 | Reprise du lendemain : Gantt vide, À placer encore proposé | PASS | e2e séries |
| 22 | Brouillon : date et immatriculation après rechargement | PASS | e2e brouillon |
| 23 | Export CSV : colonnes, date, statut, patient, cellules repas | PASS | e2e export |
| 24 | Feuille PDF Lomaco IMPRESSION_STD | PASS | e2e export |
| 25 | Tuiles OpenStreetMap, sans clé d'API | PASS | e2e carte |
| 26 | Secours de tuile si `tile.openstreetmap.org` est coupé | PASS | e2e carte, bureau seulement |
| 27 | Mode sombre, y compris le fond de carte | PASS | e2e carte |
| 28 | Routage en échec : bandeau « Routage dégradé », tracés estimés | PASS | e2e OSRM muet |
| 29 | Plus de 80 courses : génération < 20 s, bloc cliquable < 3 s | PASS | e2e journée chargée |
| 30 | Pas de plafond AMB 15 / VSL 25 : 18 et 28 courses posées, aucune alerte de charge | PASS | unitaire |
| 31 | Solveur : repas, amplitude, ordre dialyse, journée ≥ 80 courses < 8 s | PASS | unitaire |
| 32 | L'attente de séance allonge l'occupation et refuse un créneau trop court | PASS | unitaire |
| 33 | Tolérance : intérieur accepté, extérieur refusé | PASS | unitaire + libellés e2e |
| 34 | Alignement unitaire sur 5 minutes et refus d'un créneau déjà pris | PASS | unitaire |
| 35 | Tout départ affiché après un pas D-pad reste un multiple de 5 | FAIL | run OSRM de la session, voir bug 2 |
| 36 | Le geste accepte une course au-delà de 15 ambulance et de 25 VSL | PASS | unitaire `previewPlacement` |
| 37 | Ordre aller avant retour bloquant pour une série qui n'est pas une dialyse | PASS | unitaire solveur + synthèse |
| 38 | Attente de séance lisible sur la timeline en 390×844 | FAIL | infobulle coupée en vue étroite, fichier du lead |
| 39 | CSV : colonne `attente` optionnelle, elle crée le retour lié | PASS | unitaire |
| 40 | Meilleur créneau et resserrage utilisent les règles du jour | PASS | unitaire PEC courte |

## Journée chargée (ce run)

Demande « chargee », 3 ambulances et 3 VSL : **108 courses**.

| Viewport | Clic sur Générer | Solveur (`elapsedMs`) | Après le clic, jusqu'à Appliquer | Mur | Courses posées |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 100 ms | 655 ms, 24 870 évaluations | 770 ms | 870 ms | 90 |
| 390×844 | 105 ms | 650 ms, 26 272 évaluations | 755 ms | 860 ms | 90 |

Le clic téléphone est revenu au même ordre que le bureau (105 ms, budget du test : sous 2 s). Le solveur reste autour de 0,6 s. Le contrôle 29 reste PASS (sous 20 s, premier bloc sous 3 s).

## Correctifs de cette mesure

- 15 et 25 ne sont pas des plafonds. Le refus a été retiré de `previewPlacement`, du solveur et de la revue. Les réglages n'affichent plus « Charge max ». Une ambulance peut prendre 18 courses, un VSL 28, si la vacation les contient.
- Colonne CSV `attente` optionnelle, en fin de gabarit. Si elle est remplie, le retour est créé : prise en charge = heure de l'aller + attente, sur 5 minutes, adresses inversées. Un aller-retour sans `heure_retour` passe dès que l'attente est là. Au-delà de 480 minutes, la ligne est rejetée. La saisie manuelle fait la même chose, et modifier l'attente met à jour le retour déjà lié.
- `seriesOrderOk` bloque l'inversion aller/retour pour toute série. La synthèse le signale aussi. Les alertes propres à la dialyse (séance, retour manquant, équipages différents) restent limitées à la dialyse.
- `bestSlot`, `snapBack` et `compact` passent `state.rules`.
- « Données et export » se referme quand la vue quitte cette section, et se rouvre sur Patients, Véhicules, etc. Vérifié au bureau.
- Les champs Nom et Prénom ont un `aria-label`. Vérifié dans l'import e2e.
- Le toast d'ouverture (« Demande de demain chargée ») restait 4,6 s en haut de l'écran et recouvrait Générer en 390×844. Il est placé sous la barre et ne capte plus les clics. Les lignes de demande hors écran sautent la mise en page (`content-visibility: auto`). Le bouton du bandeau ne rétrécit plus.

## Encore ouvert

### 1. Le départ affiché sort de la grille de 5 minutes

Le D-pad demande un départ snapping à 5 minutes. Le Gantt réaffiche la simulation ancrée, qui peut pousser le bloc. Laissé au lead (`GanttBoard`, `PlanningWorkspace`).

Fichiers : `src/game/schedule.ts` (`scheduleCrew`, mode `anchored`), `src/components/planning/GanttBoard.tsx`, `src/components/planning/PlanningWorkspace.tsx`.

### 2. L'attente de séance est invisible sur la timeline téléphone

La demande et le CSV la montrent. L'infobulle du Gantt est réservée à `!narrow`, et le bandeau de sélection ne montre pas `stayMin`. Fichiers du lead.

### 3. Le motif du D-pad reste affiché après un refus de glisser

Toast et `.dpad-reason` coexistent. `DPad.tsx`, laissé au lead.

## Hors périmètre de cette mesure

- Pas de téléphone physique. Le 390×844 est une fenêtre Chrome.
- Le secours de tuile n'est joué qu'au bureau. Le téléphone vérifie que les tuiles OSM chargent, sans couper le domaine principal.
- Les suites e2e déjà dans le dépôt (`daily`, `smoke`, `tactile`, `lomaco`) n'ont pas été relancées ici. Le score ne les compte pas.
- `src/components/planning/` est laissé au lead (bugs d'affichage : grille de 5 minutes, attente sur la timeline téléphone, motif du D-pad).
