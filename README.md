# Ambux – Régulateur

Outil de démonstration pour préparer le planning du lendemain d'une société de transport sanitaire. Le régulateur charge les transports, génère les tournées sur de vrais itinéraires autour de Rouen, ajuste la timeline, puis imprime les feuilles de route.

Tout se passe dans le navigateur. Aucun serveur, aucune donnée patient réelle.

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

1. Choisissez la flotte et la densité, puis **Préparer le planning**.
2. Dans **Demande de demain**, importez un CSV ou ajoutez un transport.
3. **Générer le planning** affecte les équipages, pose la pause repas (30 min entre 11 h et 14 h 30) et compte les trajets à vide.
4. Sur la timeline, déplacez une prise en charge autour de l'heure prévue (pastille marine). L'écart s'affiche en orange, par exemple +12 min. **Revenir à l'heure prévue** recale le rendez-vous.
5. La carte trace les routes réelles (OSRM) et place les véhicules le long du trajet.
6. **Feuilles de route** ouvre une impression PDF. **Envoyer vers Lomaco** est une maquette.
7. **Simuler la journée** est un mode optionnel : horloge accélérée et appels.

Véhicules, équipages (DEA compris) et patients se modifient dans les vues du même nom.
