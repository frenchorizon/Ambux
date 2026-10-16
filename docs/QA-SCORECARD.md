# Scorecard QA — journée du régulateur

Mesure du 16 octobre 2026, branche `qa/journee-regulateur`, révision exercée `e0753e7`.

**Score : 34 / 40 = 85 %.**

Le chiffre compte des contrôles de la journée réelle d'un régulateur. Un contrôle est PASS seulement s'il a été exécuté dans cette session et a réussi. Les écarts confirmés par le code, et pour la grille de 5 minutes par un run antérieur de la même session, sont FAIL. Le but affiché était 95 % : la suite tient le parcours nominal, les cinq écarts qui restent sont des règles que le produit n'applique pas encore sur le geste ou à l'écran.

## Comment c'est mesuré

- Navigateur : Google Chrome du système, Playwright `channel: chrome`, locale `fr-FR`. Pas d'iPhone physique.
- Téléphone émulé : 390×844. Bureau : 1440×900.
- Application : `npm run dev` sur `http://127.0.0.1:5280`.
- Bout en bout : `npx playwright test e2e/journee-regulateur.spec.ts` — **18/18 passés en 1,8 min** (9 scénarios × 2 viewports).
- Unitaire : `npx tsx --test` sur `scripts/schedulerRules.test.ts`, `scripts/rules.test.ts`, `scripts/lomaco.test.ts`, `scripts/lomacoSheet.test.ts`, `scripts/ganttSegments.test.ts` — **43/43 passés** (~4,7 s).
- Le routage des gestes Gantt est forcé en estimation (`ambux.routing=estimate`) pour que le temps affiché ne bouge pas sous un aller-retour OSRM. Les tuiles et le secours de routage sont testés à part, réseau réel.

Seule modification de l'application sur cette branche : la ligne de demande affiche `attente N min` (`src/components/Editors.tsx`). Aucun fichier de `src/components/planning/` n'a été modifié.

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
| 13 | Réglages : tolérance 20 min, AMB 15, VSL 25, séance 4 h | PASS | e2e règles |
| 14 | Tap Gantt : heure prévue = rendez-vous, RDV d'origine visible | PASS | e2e Gantt |
| 15 | D-pad +5 min sur une course qui reste alignée, puis Annuler, Rétablir, Ctrl+Z | PASS | e2e Gantt |
| 16 | D-pad : changement de véhicule, puis Annuler | PASS | e2e Gantt |
| 17 | Refus allongé vers un VSL, au D-pad et au glisser | PASS | e2e Gantt (souris au bureau, pointeur synthétique au téléphone) |
| 18 | Séance saisie : aller, retour, « attente 45 min » dans la demande | PASS | e2e import |
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
| 30 | Solveur : plafond 15 AMB et 25 VSL, alerte de revue si dépassement | PASS | `scripts/schedulerRules.test.ts` |
| 31 | Solveur : repas, amplitude, ordre dialyse, journée ≥ 80 courses < 8 s | PASS | unitaire |
| 32 | L'attente de séance allonge l'occupation et refuse un créneau trop court | PASS | unitaire |
| 33 | Tolérance : intérieur accepté, extérieur refusé | PASS | unitaire + libellés e2e |
| 34 | Alignement unitaire sur 5 minutes et refus d'un créneau déjà pris | PASS | unitaire |
| 35 | Tout départ affiché après un pas D-pad reste un multiple de 5 | FAIL | run OSRM de la session, voir bug 2 |
| 36 | D-pad, glisser ou Meilleur créneau refusent la 16e ambulance ou la 26e VSL | FAIL | `previewPlacement` ne compte pas la charge |
| 37 | Ordre aller avant retour bloquant pour une série qui n'est pas une dialyse | FAIL | pénalité souple seulement |
| 38 | Attente de séance lisible sur la timeline en 390×844 | FAIL | infobulle coupée en vue étroite |
| 39 | Import CSV d'une attente de séance | FAIL | pas de colonne |
| 40 | Meilleur créneau et resserrage utilisent les règles du jour | FAIL | appel sans `state.rules` |

## Journée chargée (ce run)

Demande « chargee », 3 ambulances et 3 VSL : **108 courses**.

| Viewport | Génération jusqu'au bouton Appliquer | Courses posées |
| --- | --- | --- |
| 1440×900 | 917 ms | 90 |
| 390×844 | 6 199 ms | 92 |

Les deux restent sous 20 s. Le premier bloc du Gantt devient cliquable en moins de 3 s. Le solveur unitaire place une journée du même ordre en moins de 8 s et garde repas, plafonds et ordre de dialyse.

## Bugs, par priorité

### 1. Le geste ignore les plafonds AMB 15 et VSL 25

Le solveur refuse une 16e course d'ambulance et une 26e de VSL. La revue signale le dépassement. Le placement manuel non : `previewPlacement` contrôle l'annulation, la course déjà partie, l'allongé, le DEA, le trou et la vacation, pas le nombre de courses. Meilleur créneau passe par le même placement.

Repro : générer une journée, ou empiler des courses compatibles sur une ambulance jusqu'à 15, puis glisser ou « Meilleur créneau » une 16e course assise. Elle se pose. La synthèse la marque ensuite en dépassement, sans l'avoir refusée.

Fichiers : `src/game/schedule.ts` (`previewPlacement`, vers la ligne 420), `src/game/optimizer.ts` (`maxCourses`, vers la ligne 177), `src/game/review.ts` (vers la ligne 52).

### 2. Le départ affiché sort de la grille de 5 minutes

Le D-pad demande un départ snapping à 5 minutes (`previewOnGrid`). Le Gantt réaffiche ensuite la simulation ancrée : `scheduleCrew` prend `max(departMin, curseur)` et peut pousser le départ après la course précédente ou une pause. `data-depart` est ce temps simulé.

Repro observé dans cette session, avant de forcer le routage estimé : au bureau, « 5 minutes plus tard » a laissé un `data-depart` de reste 4 ; au téléphone, Annuler a affiché 487 minutes au lieu de 484, le temps OSRM ayant bougé la chaîne. Le test vert cherche jusqu'à 8 courses une qui reste alignée, et annule les autres. Il prouve le pas, pas la garantie.

Fichiers : `src/game/schedule.ts` (`scheduleCrew` mode `anchored`, vers la ligne 226 ; `previewOnGrid`, vers la ligne 497), `src/components/planning/GanttBoard.tsx` (`data-depart`, vers la ligne 256), `src/components/planning/PlanningWorkspace.tsx` (`nudgeMission`, vers la ligne 497).

### 3. L'attente de séance est invisible sur la timeline téléphone

La demande affiche `attente N min` (correctif de cette branche). L'infobulle du Gantt, qui contient `attente établissement N min`, n'est rendue que si `!narrow`. Le bandeau de sélection montre vide, PEC, trajet et dépose, pas `stayMin`. En 390×844 le régulateur ne voit donc pas l'attente sur la timeline.

Repro : Demande de demain, Ajouter un transport, attente 45, enregistrer, ouvrir la timeline de cette course sur un viewport 390×844. La ligne de demande a l'attente. La timeline non.

Fichiers : `src/components/planning/GanttBoard.tsx` (vers les lignes 107 et 360), `src/components/planning/PlanningWorkspace.tsx` (bandeau vers la ligne 281), `src/components/Editors.tsx` (ligne de demande).

### 4. Le CSV de courses ne porte pas l'attente

`CSV_COLUMNS` est `dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour`. Une séance avec attente ne s'importe pas : il faut le formulaire.

Repro : coller le gabarit affiché dans Importer. Aucune colonne d'attente. L'aperçu ne peut pas montrer « attente N min ».

Fichier : `src/game/csv.ts` (vers la ligne 7).

### 5. L'ordre aller puis retour n'est bloquant que pour la dialyse

`seriesOrderOk` ignore les séries dont le type ne commence pas par `dialyse`. Pour les autres, `seriesPenalty` ajoute 36 si les deux sens sont sur des équipages différents et 48 si le retour précède l'aller sur le même équipage. La revue ne signale l'ordre que pour la dialyse. Un rendez-vous classique retombe en général sur l'heure, mais une série rapprochée peut s'inverser sans refus.

Repro unitaire déjà couvert pour la dialyse (le retour suit). Pour une série simple, aucun test de refus : le code ne refuse pas.

Fichiers : `src/game/optimizer.ts` (`seriesOrderOk` vers la ligne 234, `seriesPenalty` vers la ligne 253), `src/game/review.ts` (vers la ligne 123).

### 6. Meilleur créneau et le resserrage ignorent les règles modifiées

`bestSlotFor` et `suggestCompact` ont un argument `rules`, mais `bestSlot`, `snapBack` et `compact` ne passent pas `state.rules`. La recherche utilise donc les durées par défaut. `assign` revérifie ensuite avec les règles du jour : un créneau trouvé peut être refusé, ou un repas / une PEC modifiée peut être ignorée pendant la recherche. Avec les réglages d'usine le parcours e2e « Meilleur créneau » passe.

Repro : Réglages, allonger la PEC ou la pause, retirer une course, À placer, Meilleur créneau. Comparer avec un placement D-pad, qui appelle `previewOnGrid` avec `data.rules`.

Fichier : `src/game/reducer.ts` (vers les lignes 385, 392 et 771).

### 7. Le motif du D-pad reste affiché après un autre refus

Un refus de D-pad écrit `.dpad-reason`. Un glisser refusé envoie un toast et n'efface pas ce motif. `nudgeMission` remet le motif à vide seulement quand le pas suivant réussit. Le test doit prendre le premier texte « Incompatibilité », parce que le toast et le motif sont vrais en même temps.

Repro : sélectionner un allongé, « Véhicule suivant » jusqu'au refus, puis le glisser vers un VSL. Le toast et l'ancien motif coexistent.

Fichiers : `src/components/planning/DPad.tsx` (vers la ligne 122), `src/components/planning/PlanningWorkspace.tsx` (`setNote(null)` seulement après un pas accepté, vers la ligne 538).

### 8. « Données et export » reste déplié au bureau

`more` est initialisé avec la vue du premier rendu et ne suit pas les changements de vue. Après « Planning en 1 clic », la section reste ouverte. Ce n'est pas bloquant : les entrées répondent. C'est pour cela que les tests cliquent le bouton du bandeau, pas celui de la barre latérale.

Fichier : `src/components/Sidebar.tsx` (vers la ligne 65).

### 9. Nom et prénom n'ont pas d'étiquette

Les champs patient et transport n'ont qu'un `placeholder` (`Nom`, `Prénom`). Le nom accessible est ce texte, et « Prénom » contient « nom ». Pendant l'e2e, `getByPlaceholder("Nom")` visait trois champs à la fois, dont la zone CSV. Un lecteur d'écran annonce le placeholder, pas une étiquette stable.

Repro : Demande de demain, Ajouter un transport. Inspecter les deux premiers champs : pas de `label` ni de `aria-label`.

Fichier : `src/components/Editors.tsx` (formulaire patient vers la ligne 275, formulaire transport vers la ligne 446).

### 10. La génération est beaucoup plus lente en viewport téléphone

Même Chrome, même machine, même demande de 108 courses : 917 ms en 1440×900, 6 199 ms en 390×844. Le budget de 20 s tient, le contrôle 29 est donc PASS. L'écart vient de l'affichage, pas d'un autre algorithme. Sur un téléphone réel, plus lent que cette émulation, la marge se réduit.

Repro : Données, densité chargée, 3 AMB + 3 VSL, Préparer ce planning, Générer, chronométrer jusqu'à « Appliquer ce planning » dans les deux viewports.

Fichiers : `e2e/journee-regulateur.spec.ts` (scénario journée chargée), `src/game/optimizer.ts`.

## Hors périmètre de cette mesure

- Pas de téléphone physique. Le 390×844 est une fenêtre Chrome.
- Le secours de tuile n'est joué qu'au bureau. Le téléphone vérifie que les tuiles OSM chargent, sans couper le domaine principal.
- Les suites e2e déjà dans le dépôt (`daily`, `smoke`, `tactile`, `lomaco`) n'ont pas été relancées ici. Le score ne les compte pas.
- `src/components/planning/` est laissé aux agents Gantt. Les bugs 2, 3 et 7 y ont leur correctif d'affichage.
