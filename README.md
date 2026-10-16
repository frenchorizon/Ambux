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
3. **Importer** (menu ⋯, et boutons visibles sur téléphone) lit un ou plusieurs `.xlsx`, `.xls` ou `.csv` : courses, patients, personnel, véhicules. Les colonnes se reconnaissent, le profil « Lomaco (à confirmer) » se corrige et s'enregistre. L'aperçu tableau montre les lignes, les rejets et les avertissements. Une attente de séance crée le retour. Rien n'est écrit avant Fusionner, qui s'annule en un seul geste. Le collage CSV de **Demande de demain** reste dans Réglages, rubrique Données.
4. **Générer le planning** respecte la tolérance, la charge max (15 ambulance / 25 VSL), l'amplitude (11 h, prises de poste décalées), la pause repas et le DEA. Ce qui ne tient pas va dans **À contrôler**.
5. Sur la timeline, chaque course se lit en trois temps : trajet à vide, prise en charge, trajet en charge et dépose. Un tap donne le détail, les kilomètres, et une croix pour changer de véhicule ou décaler de 5 minutes. Un appui long glisse la course ; un mouvement franc fait défiler le planning. Cherchez un patient, filtrez un équipage, zoomez. La carte est à côté du planning. L'écart horaire est un badge orange.
6. **Exporter** (menu ⋯, et boutons visibles sur téléphone) écrit d'abord le planning (CSV point-virgule UTF-8, ou Excel avec dates françaises) : date, heure de début, patient, adresses, équipe, véhicule, durée estimée. La période par défaut est le lendemain préparé, les colonnes se mémorisent. En dessous, les feuilles de route à réimporter dans Lomaco (Excel ou CSV, une feuille par équipage). Le PDF par défaut est **Feuille de route Lomaco**. Annuler et rétablir sont dans la barre (aussi Ctrl+Z). Le menu ne garde qu'Importer, Feuilles de route, Exporter et Aide.
7. **Simuler la journée** est dans Aide, rubrique Démo : horloge accélérée et appels, à part du planning.
8. Si OSRM ne répond pas, un bandeau rouge signale les kilomètres estimés, repris sur la timeline et le PDF.

Véhicules, équipages (DEA compris), patients et la demande se modifient dans Réglages, rubrique Données. La synthèse compare le planning affiché au planning initial (ordre des rendez-vous, premier équipage compatible).
