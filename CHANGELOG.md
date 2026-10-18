# Journal des versions

Le tag git est la référence. Les jalons d'avant `v0.3.0-mvp-epure` n'ont pas été tagués : ils restent dans l'historique de `main`.

## v0.9.0-alpha.1 — 2026-10-18

Branche `feat/refonte-lot1-jetons`. Lot 1 de la refonte « verre nuit » : jetons et fond. Pas de tag. Le mode clair de la v0.8.0 reste dans Réglages, rubrique Affichage.

- Thème nuit par défaut, de `#0A1622` à `#0F2A3A`, avec un dégradé et un voile sombre. Pas de photo. Pas de `background-attachment: fixed`.
- Jetons de verre et classe `.glass` : fond `rgba(255,255,255,.06)`, bord `rgba(255,255,255,.12)`, rayon 16 à 20 px, flou 20 px (14 px sous 1024 px), préfixe `-webkit-backdrop-filter`, repli opaque si le flou n'est pas disponible. Le flou reste sur les panneaux statiques (coque, accueil, synthèse, réglages). Pas de flou sur les lignes ou les blocs du Gantt, ni sur la carte.
- Plus Jakarta Sans, graisse 300 pour les titres et les grands chiffres. Fraunces sort de l'interface. Texte secondaire à 68 % de blanc. Plancher de 13 px.
- Un rôle par couleur : teal `#2EC4B6` (primaire, en service), vert pour les gains, corail pour les alertes, jaune doux pour Repas.
- Les feuilles imprimées et le PDF Lomaco restent en noir et blanc, dans leur propre document.

## v0.8.0 — 2026-10-16

Tag `v0.8.0`. Branches `feat/v0.8-gantt-tactile`, `qa/journee-regulateur`, `feat/imprevus`, `ux/donnees-menu`, `feat/import-export`.

- Le bloc suit le doigt à chaque image. Le contrôle de créneau ne se relance que si l'équipage ou la minute calée sur 5 minutes change. Près du bord, le planning défile pendant le glisser.
- L'appui long se voit (anneau bleu) avant le déplacement. Le défilement, le seuil de 18 px et le zoom restent.
- Un créneau impossible montre un fantôme rose et la raison complète pendant le glisser (allongé sur VSL, ambulance sans DEA, conflit, course engagée, transport annulé).
- Reposer la course sur le même équipage et le même créneau de 5 minutes n'ajoute pas d'annulation. Échap annule un glisser en cours, sans écrire la course.
- Absence d'équipage ou panne de véhicule, sur la journée ou un créneau : les courses concernées vont dans À placer, ou sont replacées si on le demande.
- Appel tardif : formulaire court, pose immédiate quand un créneau existe.
- Régénérer sans tout bouleverser : les courses épinglées et déjà en place restent. Le résumé nomme les courses déplacées. Annuler revient en une seule étape.
- Un déplacement à la main épingle la course. Rien ne déplace une course épinglée sans un geste explicite.
- Poser un créneau indique quelles courses suivantes sont décalées. Une suivante épinglée bloque le geste.
- Une course déjà calée sur 5 minutes le reste à l'écran si la simulation ancrée ou l'annulation la pousse. L'attente d'une séance se lit sur la timeline, y compris sur téléphone. Un refus de glisser efface la raison précédente de la croix.
- Le menu ⋯ ne garde qu'Importer, Feuilles de route, Exporter et Aide. Annuler et rétablir restent dans la barre.
- Équipages, véhicules, patients et demande de demain sont dans Réglages, rubrique Données. Le mode sombre aussi. La simulation est sous Aide, rubrique Démo.
- Mention explicite : les données restent dans ce navigateur.
- Journée type de Rouen : adresses et établissements plausibles (CHU Charles-Nicolle, Becquerel, cliniques, dialyse, kinés), environ 67 courses pour 3 ambulances et 3 VSL, kilomètres à vide autour de 27 %.
- La synthèse retire le temps de régulation à 00:00 et compare le planning affiché au planning initial : kilomètres à vide, temps de trajet à vide, courses placées.
- 15 ambulance et 25 VSL restent l'exemple d'une journée chargée. Ils ne refusent aucune course.
- L'import couvre les courses, les patients, le personnel et les véhicules. Une attente de séance crée le retour, sur la grille de 5 minutes. L'aperçu est un tableau (lignes, rejets, avertissements). Rien n'est écrit avant Fusionner, qui s'annule en une seule étape.
- Export du planning en CSV (point-virgule, BOM) et Excel (dates JJ/MM/AAAA), filtre de dates, colonnes mémorisées. Les feuilles Lomaco restent disponibles.
- Sur téléphone, Importer et Exporter sont visibles sous la barre.

## v0.7.0 — 2026-10-16

Tag `v0.7.0`. Branche `feat/v0.7-tactile`.

- Le doigt sur une course : un tap sélectionne, un appui long puis un glisser déplace, un mouvement franc avant l'appui long laisse défiler le planning. `pointercancel` n'écrit rien.
- Les blocs ne déclenchent plus la loupe ni le menu copier (sélection coupée sur le bloc seulement, zoom d'accessibilité conservé). La zone touchée fait au moins 44 px, le bloc suit le doigt, un seul enregistrement au relâchement.
- Croix directionnelle, en bas à droite, quand une course est sélectionnée. Haut et bas changent de véhicule, gauche et droite décalent de 5 minutes. Un créneau refusé affiche la raison et ne s'applique pas. Les flèches du clavier font la même chose.
- Un maintien ou une répétition clavier forme une seule étape d'annulation. Deux appuis séparés restent deux étapes. Les déplacements et les glissers se calent sur 5 minutes.

## v0.6.0 — 2026-10-16

Tag `v0.6.0`. Branche `feat/v0.6-gantt-segments`.

- Chaque course du Gantt est en trois segments : trajet à vide hachuré, prise en charge, trajet en charge et dépose. Les largeurs suivent les durées.
- Prise en charge (10 min ambulance, 5 min VSL) et dépose (8 min) se règlent dans Réglages.
- Les durées de route viennent d'OSRM, ou d'ORS si une clé est enregistrée dans ce navigateur (`ambux.ors`). Le tracé droit n'est utilisé que si le routage échoue, avec un point d'alerte.
- Déplacer une course recalcule le trajet à vide depuis l'arrêt précédent. Un tap affiche vide, PEC, trajet, dépose et les kilomètres.

## v0.5.1 — 2026-10-16

Tag `v0.5.1`. Branche `feat/v0.5.1-feuille-lomaco`.

- Feuille de route PDF « Planning », choix IMPRESSION_STD : une page A4 portrait noir et blanc par équipage.
- En-tête : date à gauche, « Planning - Édité le … / Par … / Choix IMPRESSION_STD » au centre, « Page x/y » à droite.
- Colonnes Transport, Personne transportée, horaires (prise en charge, RDV en gras, dépose), Trajet, Équipage. Une ligne de séparation reprend la note, par exemple PRENDRE PROCHAIN RDV.
- L'import reconnaît naissance, motif (DIAL, KINE, CONS, ORTHO, RADI), série ou unique, et le code véhicule. Données de démonstration fictives.

## v0.5.0 — 2026-10-16

Tag `v0.5.0`. Branche `feat/v0.5-import-lomaco`.

- Flux fichier, sans API : Importer (menu ⋯) lit un ou plusieurs `.xlsx`, `.xls` ou `.csv`.
- Les colonnes se reconnaissent (heure RDV, adresses, AMB/VSL/TAP, aller/retour, équipage, immatriculation). Le profil « Lomaco (à confirmer) » se règle puis s'enregistre.
- Aperçu des courses, véhicules et équipages, avec les lignes rejetées. TAP est planifié comme un VSL.
- Export des feuilles de route : une feuille par équipage en CSV ou Excel, colonnes réglables, même profil, plus l'impression PDF. Les conducteurs restent sur l'application Lomaco.

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
