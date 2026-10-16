# Journal des versions

Le tag git est la référence. Les jalons d'avant `v0.3.0-mvp-epure` n'ont pas été tagués : ils restent dans l'historique de `main`.

## v0.4.1 — 2026-10-16

Tag `v0.4.1`. Les trous du parcours quotidien sont rejoués par `npm test`.

- Glisser à la souris et au doigt (appui long) sans chevaucher une autre course. L'allongé ne passe pas sur un VSL.
- « Heure prévue » reste visible. Le bouton ne décale plus la course si le créneau d'origine est pris.
- Brouillon repris après rechargement. Demande vidée : écran vide explicite.
- Export CSV vérifié. Feuille imprimable par équipage (page HTML).
- OSRM forcé en panne : bandeau rouge et tracés estimés.
- Import CSV des véhicules et des équipages, avec modèle à télécharger et lignes rejetées.
- Fond de carte sans clé : tuiles OpenStreetMap (repli automatique), mode sombre par inversion des tuiles. Les tuiles CARTO à filigrane ne sont plus utilisées.

## v0.4.0 — 2026-10-16

Tag `v0.4.0`. Usage quotidien du régulateur, avant tout hébergement public.

- Annuler / rétablir (boutons et Ctrl+Z), sans enregistrer l'horloge.
- Date de mission modifiable. Les courses peuvent être reprises au jour suivant, sans affectation.
- Séries habituelles (dialyse, aller-retour) ajoutées au planning. L'aller et le retour partagent la même série.
- Attente à l'établissement (séance, consultation) comptée dans la course.
- Feuille de route imprimable par équipage, et pour toute la flotte.
- `npm test` : règles du solveur et parcours navigateur (390 px et bureau).

## v0.3.0-mvp-epure — 2026-10-16

Tag `v0.3.0-mvp-epure`. Branche `stable` alignée dessus.

- Timeline réduite au Gantt, en pleine hauteur.
- Sur téléphone : barre du bas (Timeline, Carte, À placer, Synthèse, Réglages), cibles larges, appui long pour déplacer une course, colonne équipage étroite avec le nom.
- Indicateurs dans Synthèse. Règles de société (repas, tolérance, amplitude, charges, séance) dans Réglages, enregistrées dans le navigateur.
- Recherche, zoom et liste « À contrôler » derrière une icône ou un badge.
- Actions secondaires (feuilles, export CSV, simulation, thème) dans le menu.
- Fichier autonome : `ambux-v0.3.0.html`.

## Jalons précédents, non tagués

### Pitch — 2026-10-15

Page d'accueil en français, cinéma « planning en 1 clic » sur le cas mesuré 3+3 (66/67), calculateur d'hypothèse, tarifs indicatifs, visite guidée, feuille équipage, mode sombre. Le clic unique charge la journée type, pas la journée chargée.

### Planning honnête — 2026-10-15

Tolérance, pause, amplitude, charge et DEA traités comme des contraintes dures. Une date de mission. Brouillons dans le navigateur. Import CSV avec aperçu des rejets. Export CSV sans envoi fictif vers Lomaco. Kilomètres estimés signalés si OSRM ne répond pas.

### Planning du lendemain — 2026-10-15

L'outil prépare le J+1 sur les routes autour de Rouen (OSRM public, repli estimé), au lieu de simuler une régulation en direct. La simulation reste un module à part.

### Démo jouable — 2026-10-15

Première démo navigateur : régulateur, Gantt, carte, génération de tournées. Données fictives.
