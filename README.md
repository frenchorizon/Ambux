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
2. La visite guidée (Échap pour passer) puis **Feuille équipage** montrent le planning au conducteur. Le mode sombre se mémorise dans ce navigateur.
3. **Importer** (menu ⋯) lit les exports Lomaco : un ou plusieurs fichiers `.xlsx`, `.xls` ou `.csv`. Les colonnes se reconnaissent, le profil « Lomaco (à confirmer) » se corrige et s'enregistre. L'aperçu montre les courses, les véhicules, les équipages et les rejets. Le collage CSV de **Demande de demain** reste disponible.
4. **Générer le planning** respecte la tolérance, la charge max (15 ambulance / 25 VSL), l'amplitude (11 h, prises de poste décalées), la pause repas et le DEA. Ce qui ne tient pas va dans **À contrôler**.
5. Sur la timeline, chaque course se lit en trois temps : trajet à vide, prise en charge, trajet en charge et dépose. Un tap donne le détail et les kilomètres. Cherchez un patient, filtrez un équipage, zoomez. La carte est à côté du planning. L'écart horaire est un badge orange.
6. **Exporter le CSV** écrit les feuilles de route à réimporter dans Lomaco : Excel ou CSV (une feuille par équipage, colonnes du profil). Le PDF par défaut est **Feuille de route Lomaco** (planning A4, choix IMPRESSION_STD, une page par équipage). Annuler et rétablir sont dans la barre (aussi Ctrl+Z).
7. **Simuler la journée** reste un module à part : horloge accélérée et appels.
8. Si OSRM ne répond pas, un bandeau rouge signale les kilomètres estimés, repris sur la timeline et le PDF.

Véhicules, équipages (DEA compris) et patients se modifient dans les vues du même nom.
