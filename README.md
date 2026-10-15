# Ambux – Régulateur

Outil de démonstration pour préparer le planning du lendemain d'une société de transport sanitaire. Le régulateur charge les transports, génère les tournées sur de vrais itinéraires autour de Rouen, ajuste la timeline, puis imprime les feuilles de route.

Tout se passe dans le navigateur. Aucun serveur, aucune donnée patient réelle. Le brouillon du lendemain est enregistré dans ce navigateur (plusieurs versions). La date de mission est unique : vendredi 16 octobre 2026.

## Lancer

```bash
npm install
npm run dev
```

Ouvrir l'adresse affichée (port 5280).

```bash
npm run build
npm run sim
```

## Utiliser

1. Choisissez la flotte (jusqu'à 20 véhicules) et la densité, puis **Préparer le planning**. Un brouillon déjà enregistré se reprend depuis l'écran d'accueil.
2. Dans **Demande de demain**, importez un CSV (fichier ou collage). L'aperçu liste les lignes acceptées et le motif de chaque rejet. Colonnes : `dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour`.
3. **Générer le planning** respecte la tolérance, la charge max (15 ambulance / 25 VSL), l'amplitude (11 h, prises de poste décalées), la pause repas et le DEA. Ce qui ne tient pas va dans **À contrôler**.
4. Sur la timeline, cherchez un patient, filtrez un équipage, zoomez. La carte est à côté du planning. L'écart horaire est un badge orange.
5. **Feuilles de route** imprime la même date de mission. La mention DEA n'apparaît que si un DEA est enregistré. **Exporter le CSV** télécharge le planning retenu.
6. **Simuler la journée** reste un module à part : horloge accélérée et appels.
7. Si OSRM ne répond pas, un bandeau rouge signale les kilomètres estimés, repris sur la timeline et le PDF.

Véhicules, équipages (DEA compris) et patients se modifient dans les vues du même nom.
