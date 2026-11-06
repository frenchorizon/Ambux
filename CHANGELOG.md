# Journal des versions

Le tag git est la référence. Les jalons d'avant `v0.3.0-mvp-epure` n'ont pas été tagués : ils restent dans l'historique de `main`.

## v0.9.0-alpha.3-b7 — 2026-11-06

Branche `feat/beta-b7-export`, ouverte depuis `feat/beta-b9-ton-landing`. Export du planning finalisé. Pas de tag. Pas de serveur. Pas d'envoi vers Lomaco.

- L'en-tête des fichiers planning (CSV, Excel, impression) porte la société en mode entreprise, ou « Exemple fictif », la date de la journée et le dépôt.
- L'impression est en A4, une page par équipage. Le PDF Lomaco (IMPRESSION_STD) garde sa grille et reçoit le même en-tête.
- Les CSV Lomaco gardent leur première ligne de colonnes. Le classeur Excel ajoute une feuille « En-tête », ignorée à l'import.
- Entrées : Réglages, Synthèse, et le menu Exporter du planning. Un refus (dates, colonnes, fenêtre d'impression, Excel) s'explique en une phrase.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b7.html`.

## v0.9.0-alpha.3-b9 — 2026-11-06

Branche `feat/beta-b9-ton-landing`, ouverte depuis `feat/beta-b4-routage-prive`. Ton de la bêta publique. Pas de tag. Pas de serveur. Pas de tarif en vigueur.

- L'accueil présente une bêta publique : génération de planning pour le transport sanitaire, ambition de référence nationale, intégration à Lomaco et aux logiciels en place, sans les remplacer. L'accès est gratuit, l'échange est un avis (« Donner mon avis »). Les montants 0 €, 79 €, 59 € et « Sur devis » restent, marqués indicatifs et futurs, pas en vigueur. Le calculateur d'hypothèse reste, présenté comme une hypothèse de bêta.
- Le vocabulaire visible de jeu, de partie et de score sort de l'interface. Le bandeau du mode fictif affiche « Exemple ». L'aide parle de simulation. « Rejouer la journée » devient « Retour à l'accueil ». « Partie indisponible » devient « Planning indisponible ».
- La mention « pas un dispositif médical » reste. Le contexte d'avis porte la version `0.9.0-alpha.3-b9`.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b9.html`.

## v0.9.0-alpha.3-b4 — 2026-11-06

Branche `feat/beta-b4-routage-prive`, ouverte depuis `feat/beta-b3-import-guide`. Confidentialité du routage et du géocodage. Pas de tag. Pas de serveur.

- Réglages, rubrique Routage : « Pas d'envoi d'adresse ». Photon, OSRM, le miroir et OpenRouteService sont coupés. Coordonnées saisies à la main, kilomètres estimés. Bandeau « Adresses non envoyées ». Le même choix est dans l'assistant entreprise.
- Avant le premier envoi, si le mode privé est éteint : avertissement, case mémorisée dans `ambux.routing.notice.v1`, révocable dans Réglages.
- Les appels de `routing.ts` ont un délai et quelques essais. L'échec passe au kilométrage estimé, avec le bandeau de routage dégradé.
- Attribution OpenStreetMap visible. `ambux.routing`, `ambux.ors` et `ambux.tiles` sont documentés. La clé OpenRouteService reste facultative.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b4.html`.

## v0.9.0-alpha.3-b3 — 2026-11-06

Branche `feat/beta-b3-import-guide`, ouverte depuis `feat/beta-b6-feedback`. Import guidé. Pas de tag. Pas de serveur.

- Modèles CSV et Excel pour la flotte, le personnel et les missions. Une ligne d'exemple fictive, à Lyon. Les colonnes sont celles déjà lues par les imports CSV.
- Assistant en trois étapes, en mode entreprise : flotte, personnel, missions. Chaque étape propose le modèle, l'import, l'aperçu des lignes acceptées et rejetées, puis la suite. Une étape peut être passée. Le consentement d'import reste exigé avant de lire un fichier réel.
- Entrée depuis l'écran qui suit l'assistant entreprise, et depuis Réglages, rubrique Imports. Les imports CSV et Lomaco déjà en place ne changent pas.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b3.html`.

## v0.9.0-alpha.3-b6 — 2026-11-06

Branche `feat/beta-b6-feedback`. Canal d'avis. Pas de tag. Pas de mesure d'audience. Les patients, adresses, noms d'équipage et le planning détaillé ne partent pas.

- Bouton « Donner mon avis » sur l'accueil, dans le bandeau quand le mode est entreprise, et dans Réglages.
- Note de 1 à 5, texte libre, capture d'écran facultative (fichier image choisi). Le contexte joint est limité à la version, l'écran, le mode et les compteurs de courses, d'équipages et de véhicules.
- Envoi : `FEEDBACK_URL` ou `VITE_FEEDBACK_URL` (Formspree en POST, Tally en ouverture préremplie). Sinon `mailto:` vers `FEEDBACK_EMAIL` / `VITE_FEEDBACK_EMAIL`. La valeur livrée est le placeholder `a-completer@exemple.invalid`, à remplacer par Nicolas.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b6.html`.

## v0.9.0-alpha.3-b5 — 2026-11-06

Branche `feat/beta-b5-legal`. Pages légales et avertissement. Pas de tag. Le texte juridique est un brouillon à faire relire par un humain. Aucun SIRET ni aucune adresse n'est inventé.

- Mentions légales et politique de confidentialité, depuis le pied de la page d'accueil et depuis Réglages. Les données restent dans ce navigateur. Les adresses partent vers le géocodage ou le routage seulement si ces services sont utilisés.
- Mention permanente : pas un dispositif médical, version bêta, sans garantie. Sur l'accueil, et en bandeau en mode entreprise.
- En mode entreprise, le premier import CSV, Excel ou Lomaco attend une case cochée. Le consentement est dans `ambux.consent.v1`. Il se révoque dans Réglages. La démo n'est pas bloquée.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b5.html`.

## v0.9.0-alpha.3-b2 — 2026-11-06

Branche `feat/beta-b2-persistance`. Persistance locale. Pas de tag. Les clés `ambux-drafts-v1` et `ambux-workspace-v1` ne changent pas de format. Pas d'IndexedDB : le brouillon reste dans localStorage, la copie complète part dans un fichier.

- À l'ouverture, le dernier brouillon du mode en cours (démo ou entreprise) est repris. Sans brouillon, l'écran de choix ou l'assistant du lot B1 reste affiché. « Retour à l'accueil » tient jusqu'à la fermeture de l'onglet.
- Réglages : Exporter, Importer, Effacer toutes mes données de ce navigateur. Le fichier `.ambux.json` contient le planning, la configuration du navigateur et les règles. L'import vérifie le fichier, explique le refus, et demande confirmation avant de remplacer.
- Le plein ou le presque-plein du localStorage s'affiche. L'effacement retire les clés Ambux de ce navigateur et laisse les autres sites.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b2.html`.

## v0.9.0-alpha.3-b1 — 2026-11-06

Branche `feat/beta-b1-mode-entreprise`. Premier lot de la bêta gratuite. Pas de tag.

- Au premier lancement : « Essayer avec des données fictives » ou « Mon entreprise ». La démo Rouen ne change pas.
- Le mode entreprise ouvre un espace vide après un assistant court : société, dépôt (adresse ou latitude/longitude), ville et région de géocodage, amplitude. La suite utilise les écrans d'ajout et d'import déjà en place.
- Le géocodage des imports et de la fiche patient prend la ville configurée. En démo, la ville reste Rouen.
- Un bandeau permanent indique Démo ou le nom de la société, avec un bouton pour changer de mode.
- Le mode et la configuration sont dans `ambux-workspace-v1`. Les brouillons restent dans `ambux-drafts-v1`.
- Fichier autonome : `ambux-v0.9.0-alpha.3-b1.html`.

## v0.9.0-alpha.3 — 2026-10-29

Branche `feat/refonte-lot3-coque`. Lot 3 de la refonte « verre nuit » : coquille. Pas de tag. Le mode clair reste dans Réglages. Les gestes du Gantt et le CSS des blocs ne bougent pas.

- Barre latérale bureau en verre, 212 px : logo Ambux, cinq vues (Timeline, Carte, À placer, Synthèse, Réglages), item actif teal. Données, flotte, patients et feuilles restent dans Réglages et dans le menu ⋯.
- Barre du haut en verre : « Planning du … », pilule de brouillon, recherche, annuler, rétablir, « Générer le planning ». Sur téléphone étroit, le libellé du bouton devient « Générer ».
- Barre d'onglets mobile en verre, au-dessus de `env(safe-area-inset-bottom)`. Le toast reste au-dessus des onglets.
- Bandeau de routage dégradé en verre corail.
- Flou (`backdrop-filter` et `-webkit-backdrop-filter`) limité à cette coque, avec repli opaque. Pas de flou sur les lignes du Gantt ni sur la carte.
- Fichier autonome : `ambux-v0.9.0-alpha.3.html`.

## v0.9.0-alpha.2 — 2026-10-22

Branche `feat/refonte-lot2-primitives`. Lot 2 de la refonte « verre nuit » : primitives. Pas de tag. Le mode clair de la v0.8.0 reste dans Réglages, rubrique Affichage. La coque, les gestes et le CSS des blocs ne bougent pas.

- Inter, police variable auto-hébergée, sous-ensemble latin (environ 47 Ko), `font-display: swap`. Plus Jakarta Sans sort de l'interface. Le fichier autonome n'appelle plus de police en ligne.
- Styles : titre H3 Medium 20/28, corps Regular 15/22, libellé Medium 13/18, légende Regular 13/18. Le plancher de 13 px reste.
- Boutons en pilule : `primary` teal avec lueur, `glass` en contour, `ghost`, `danger` corail. Cible d'au moins 44 px. Focus teal, visible. `default` et `secondary` suivent `primary` et `glass`, pour laisser les écrans en place. `navy` reste la pilule d'une course épinglée.
- Pastilles en verre. Infobulles en verre. Dialogues en verre opaque, sans flou, parce qu'ils passent au-dessus du Gantt et de la carte.
- Toasts en verre opaque : bas droite à partir de 1025 px, au-dessus de la barre d'onglets en dessous, avec `safe-area-inset-bottom`.
- Jetons Nuit alignés : fond `#0A1622`, primaire `#2EC4B6`, verre `#ffffff0f`, trait `#ffffff1f`, texte secondaire `#ffffffa6`, alerte `#FF7A6B`, succès `#4ADE80`, repas `#F5D98B`. Les pastels d'équipage sont posés ; les blocs du Gantt les prennent au lot timeline.
- Fichier autonome : `ambux-v0.9.0-alpha.2.html`.

## v0.9.0-alpha.1 — 2026-10-18

Branche `feat/refonte-lot1-jetons`. Lot 1 de la refonte « verre nuit » : jetons et fond. Pas de tag. Le mode clair de la v0.8.0 reste dans Réglages, rubrique Affichage.

- Thème nuit par défaut, de `#0A1622` à `#0F2A3A`, avec un dégradé et un voile sombre. Pas de photo. Pas de `background-attachment: fixed`.
- Jetons de verre et classe `.glass` : fond `rgba(255,255,255,.06)`, bord `rgba(255,255,255,.12)`, rayon 16 à 20 px, flou 20 px (14 px sous 1024 px), préfixe `-webkit-backdrop-filter`, repli opaque si le flou n'est pas disponible. Le flou reste sur les panneaux statiques (coque, accueil, synthèse, réglages). Pas de flou sur les lignes ou les blocs du Gantt, ni sur la carte.
- Plus Jakarta Sans, graisse 300 pour les titres et les grands chiffres. Fraunces sort de l'interface. Texte secondaire à 68 % de blanc. Plancher de 13 px.
- Sur 390 px, le cadre et les libellés de la croix laissent passer le tap. Seuls ses boutons restent actifs : le texte à 13 px ne masque ni une course ni « Retirer ». La zone de toucher des blocs et `touch-action` ne changent pas.
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
