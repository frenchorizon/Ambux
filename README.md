# Ambux – Régulateur

Bêta publique d'un logiciel de génération de planning pour les sociétés de transport sanitaire. L'ambition est d'en faire la référence nationale, en s'intégrant aux logiciels déjà en place (Lomaco et les autres), sans les remplacer. L'accès est gratuit pendant la bêta ; un avis est demandé en échange. Ce n'est pas encore un abonnement. La page d'accueil pose ce positionnement (mesure, calculateur d'hypothèse, montants indicatifs futurs), puis charge un exemple fictif autour de Rouen, ou la société configurée dans ce navigateur. Pas un dispositif médical.

Tout se passe dans le navigateur. Aucun serveur, aucune donnée patient réelle. Le brouillon est enregistré dans ce navigateur (plusieurs versions). La date de mission se change dans la barre du haut ; l'exemple s'ouvre sur le vendredi 16 octobre 2026.

## Lancer

```bash
npm install
npm run dev
```

Ouvrir l'adresse affichée (port 5280).

```bash
npm run build
npm test
npm run sim
```

`npm test` lance les règles du solveur (tolérance, repas, charge, chevauchement, CSV, annuler) puis un parcours navigateur à 390 px et sur grand écran.

## Utiliser

1. Sur l'accueil, **Planning de demain en 1 clic** lance la journée type mesurée (3 ambulances, 3 VSL) et dessine les tournées. **Préparer ce planning** choisit une autre flotte. **Donner mon avis** ouvre le canal d'avis. **Noter ma société** enregistre le formulaire dans ce navigateur, sans envoi, et ne débloque rien. Un brouillon déjà enregistré se reprend depuis le même écran.
2. La visite guidée (Échap pour passer) puis **Feuille équipage** (dans Aide) montrent le planning au conducteur. Le mode sombre est dans Réglages et se mémorise dans ce navigateur.
3. **Importer** (menu ⋯, et boutons visibles sur téléphone) lit un ou plusieurs `.xlsx`, `.xls` ou `.csv` : courses, patients, personnel, véhicules. Les colonnes se reconnaissent, le profil « Lomaco (à confirmer) » se corrige et s'enregistre. L'aperçu tableau montre les lignes, les rejets et les avertissements. Une attente de séance crée le retour. Rien n'est écrit avant Fusionner, qui s'annule en un seul geste. Le collage CSV de **Demande de demain** reste dans Réglages, rubrique Données.
4. **Générer le planning** respecte la tolérance, l'amplitude (11 h, prises de poste décalées), la pause repas et le DEA. 15 ambulance et 25 VSL sont l'exemple d'une journée chargée, pas un plafond. Ce qui ne tient pas va dans **À contrôler**.
5. Sur la timeline, chaque course se lit en trois temps : trajet à vide, prise en charge, trajet en charge et dépose. Un tap donne le détail, les kilomètres, et une croix pour changer de véhicule ou décaler de 5 minutes. Un appui long arme le glisser (anneau bleu) ; un mouvement franc avant ça fait défiler le planning. Pendant le glisser, un créneau refusé s'affiche en rose avec la raison, et reposer la course au même endroit ne compte pas comme une modification. Échap annule le glisser. Un déplacement qui change vraiment l'heure ou le véhicule épingle la course. Cherchez un patient, filtrez un équipage, zoomez. La carte est à côté du planning. L'écart horaire est un badge orange.
6. Les imprévus se règlent sans reprendre toute la journée. Sur la feuille équipage (dans Aide) : absence ou panne (journée ou créneau), les courses passent dans À placer ou sont replacées. Dans À placer : un appel tardif (formulaire court, souvent vers 19:00) se pose s'il existe un créneau. **Régénérer sans tout bouleverser** ne touche ni les courses épinglées ni celles déjà en place ; le résumé liste les courses déplacées, et annuler revient en une seule étape. Le détail d'une course montre les courses suivantes qu'un nouveau créneau décalerait. Une course épinglée ne bouge jamais toute seule.
7. **Exporter** (menu ⋯, boutons visibles sur téléphone, Synthèse et Réglages) écrit le planning du jour. L'en-tête porte le nom de la société, ou « Exemple fictif », la date et le dépôt. CSV point-virgule UTF-8, Excel avec dates françaises, ou impression A4 (une page par équipage, à enregistrer en PDF depuis le navigateur). En dessous, les feuilles à réimporter dans Lomaco : le CSV garde ses colonnes, l'Excel ajoute une feuille En-tête, le PDF reste le planning A4 IMPRESSION_STD. Rien n'est envoyé. Annuler et rétablir sont dans la barre (aussi Ctrl+Z). Le menu ne garde qu'Importer, Feuilles de route, Exporter et Aide.
8. **Simuler la journée** est dans Aide, rubrique Simulation : horloge accélérée et appels, à part du planning.
9. Si OSRM ne répond pas, un bandeau rouge signale les kilomètres estimés, repris sur la timeline et le PDF.

## Adresses et routage

« Pas d'envoi d'adresse » est dans Réglages, rubrique Routage, et dans l'assistant entreprise. Le mode coupe Photon (`photon.komoot.io`), OSRM (`router.project-osrm.org`), le miroir `routing.openstreetmap.de` et OpenRouteService. Les coordonnées se saisissent à la main. Les kilomètres sont estimés dans le navigateur. Un bandeau indique que les adresses ne sont pas envoyées.

Sans ce mode, un avertissement est demandé une fois avant le premier envoi. Il est mémorisé dans `ambux.routing.notice.v1` et se révoque dans Réglages.

Clés de ce navigateur, jamais envoyées vers un compte Ambux :

- `ambux.routing` = `estimate` : kilomètres estimés, sans OSRM. Le géocodage Photon reste possible.
- `ambux.routing.private.v1` : mode privé.
- `ambux.ors` : clé OpenRouteService facultative. Elle sert seulement si le mode privé est éteint, l'avertissement accepté, et si OSRM ne répond pas.
- `ambux.tiles` : modèle d'URL `https` avec `{z}`, `{x}` et `{y}`. Sinon, tuiles OpenStreetMap publiques, avec repli. L'attribution OpenStreetMap reste affichée.

Les appels ont un délai de 8 secondes et quelques essais. En cas d'échec, le bandeau de routage dégradé signale les kilomètres estimés.

Véhicules, équipages (DEA compris), patients et la demande se modifient dans Réglages, rubrique Données. La synthèse compare le planning affiché au planning initial (ordre des rendez-vous, premier équipage compatible).
