# Ambux – Régulateur

Outil de démonstration pour préparer le planning du lendemain d'une société de transport sanitaire. La page d'accueil pose le pitch (mesure, calculateur, tarifs indicatifs), puis le régulateur charge les transports, génère les tournées autour de Rouen, ajuste la timeline et exporte un CSV. Ambux se présente comme un compagnon du logiciel de régulation déjà en place, pas comme son remplaçant.

Tout se passe dans le navigateur. Aucun serveur, aucune donnée patient réelle. Le brouillon est enregistré dans ce navigateur (plusieurs versions). La date de mission se change dans la barre du haut ; la démo s'ouvre sur le vendredi 16 octobre 2026.

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

1. Sur l'accueil, **Planning de demain en 1 clic** lance la journée type mesurée (3 ambulances, 3 VSL) et dessine les tournées. **Préparer ce planning** choisit une autre flotte. **Demander une démo** enregistre le formulaire dans ce navigateur, sans envoi. Un brouillon déjà enregistré se reprend depuis le même écran.
2. La visite guidée (Échap pour passer) puis **Feuille équipage** (dans Aide) montrent le planning au conducteur. Le mode sombre est dans Réglages et se mémorise dans ce navigateur.
3. **Importer** (menu ⋯) lit les exports Lomaco : un ou plusieurs fichiers `.xlsx`, `.xls` ou `.csv`. Les colonnes se reconnaissent, le profil « Lomaco (à confirmer) » se corrige et s'enregistre. L'aperçu montre les courses, les véhicules, les équipages et les rejets. Le collage CSV de **Demande de demain** est dans Réglages, rubrique Données.
4. **Générer le planning** respecte la tolérance, la charge max (15 ambulance / 25 VSL), l'amplitude (11 h, prises de poste décalées), la pause repas et le DEA. Ce qui ne tient pas va dans **À contrôler**.
5. Sur la timeline, chaque course se lit en trois temps : trajet à vide, prise en charge, trajet en charge et dépose. Un tap donne le détail, les kilomètres, et une croix pour changer de véhicule ou décaler de 5 minutes. Un appui long arme le glisser (anneau bleu) ; un mouvement franc avant ça fait défiler le planning. Pendant le glisser, un créneau refusé s'affiche en rose avec la raison, et reposer la course au même endroit ne compte pas comme une modification. Échap annule le glisser. Un déplacement qui change vraiment l'heure ou le véhicule épingle la course. Cherchez un patient, filtrez un équipage, zoomez. La carte est à côté du planning. L'écart horaire est un badge orange.
6. Les imprévus se règlent sans reprendre toute la journée. Sur la feuille équipage (dans Aide) : absence ou panne (journée ou créneau), les courses passent dans À placer ou sont replacées. Dans À placer : un appel tardif (formulaire court, souvent vers 19:00) se pose s'il existe un créneau. **Régénérer sans tout bouleverser** ne touche ni les courses épinglées ni celles déjà en place ; le résumé liste les courses déplacées, et annuler revient en une seule étape. Le détail d'une course montre les courses suivantes qu'un nouveau créneau décalerait. Une course épinglée ne bouge jamais toute seule.
7. **Exporter** (menu ⋯) écrit les feuilles de route à réimporter dans Lomaco : Excel ou CSV (une feuille par équipage, colonnes du profil). Le PDF par défaut est **Feuille de route Lomaco** (planning A4, choix IMPRESSION_STD, une page par équipage). Annuler et rétablir sont dans la barre (aussi Ctrl+Z). Le menu ne garde qu'Importer, Feuilles de route, Exporter et Aide.
8. **Simuler la journée** est dans Aide, rubrique Démo : horloge accélérée et appels, à part du planning.
9. Si OSRM ne répond pas, un bandeau rouge signale les kilomètres estimés, repris sur la timeline et le PDF.

Véhicules, équipages (DEA compris), patients et la demande se modifient dans Réglages, rubrique Données. La synthèse compare le planning affiché au planning initial (ordre des rendez-vous, premier équipage compatible).
