# Versions livrées

`stable` désigne la dernière version qu'on accepte de montrer. On ne commit pas dessus. On ne la fait avancer qu'en fast-forward vers un tag déjà posé sur `main`.

La version courante livrée est `v0.4.1`. Les tags `v0.4.0` et `v0.3.0-mvp-epure` restent en place.

Le tunnel public n'est pas une version. Il sert le dossier `dist` de la machine du moment et peut s'arrêter. Le fichier `ambux-vX.Y.Z.html` et le tag git restent.

## Travailler

1. Partir de `main` à jour : `git checkout main && git pull origin main`.
2. Créer une branche de travail, par exemple `cursor/nom-court`.
3. Ne pas committer directement sur `main` ni sur `stable`.
4. Merger dans `main` seulement après `npm run build` et un essai court dans le navigateur (la page d'accueil s'affiche, le planning en 1 clic ouvre le Gantt).
5. Taguer chaque version livrée : `v0.4.0`, puis `v0.5.0`, etc.
6. Avancer `stable` jusqu'à ce tag, et copier le HTML autonome dans `/opt/cursor/artifacts/releases/`.

```bash
git tag -a v0.4.0 -m "Ambux v0.4.0"
git push origin main
git push origin v0.4.0
git branch -f stable v0.4.0
git push origin stable
```

## Revenir en arrière

La version figée le 16 octobre 2026 est le tag `v0.3.0-mvp-epure`.

```bash
git fetch origin --tags
git checkout v0.3.0-mvp-epure
npm install
npm run build
```

`git checkout` d'un tag détache `HEAD` : rien de nouveau n'est commité là. Pour reparter de cette version sur une branche :

```bash
git checkout -b cursor/reprise-v0.3.0 v0.3.0-mvp-epure
```

Sans recompiler, ouvrir le fichier déjà figé : `/opt/cursor/artifacts/releases/ambux-v0.3.0.html`.

Pour réaligner `main` sur cette version, seulement si c'est voulu et après accord : `git checkout main && git reset --hard v0.3.0-mvp-epure` puis un push forcé. Ce n'est pas le geste par défaut. Le checkout du tag suffit à reconstruire l'application telle qu'elle était.
