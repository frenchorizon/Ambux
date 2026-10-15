# Ambux – Régulateur

Démo jouable d'un outil de régulation pour le transport sanitaire programmé. Vous êtes le régulateur : feuilles de route d'ambulances et de VSL sur la métropole de Rouen, de 6 h à 20 h.

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

`sim` vérifie la génération d'une journée chargée et l'optimiseur.

## Jouer

1. Choisissez la flotte (2 à 4 ambulances, 2 à 4 VSL) et la densité. La journée chargée vise environ 15 courses par ambulance et 22 par VSL.
2. Le matin est déjà posé, en désordre. L'après-midi est dans **Transports non affectés**.
3. Glissez une course sur la ligne d'un équipage. Le bloc se cale sur un créneau libre. Hachures claires : trajet à vide. Hachures foncées : patient à bord. Aplat : prise en charge.
4. Un patient allongé ne va pas en VSL. Un créneau trop court affiche **Conflit horaire**.
5. Répondez aux appels (ajout, annulation, déplacement, retard, panne, pause, urgence).
6. **Recalculer** resserre les horaires. **Optimiser** compare votre plan à une recherche locale (fenêtres horaires, sans serveur). **Valider et envoyer vers Lomaco** simule l'export.
7. À 20 h, ou avec **Clôturer**, le bilan affiche kilomètres à vide, retards, remplissage, temps de régulation, et la référence de l'algorithme. Préparez ensuite le planning du lendemain.

Espace : pause. Touches 1, 2 et 4 : vitesse. Une heure de service dure environ 45 secondes en ×1.
