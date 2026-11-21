# SYSCOUT-HT — moteur de vision

Service Python séparé du serveur Django (SRS §5 : une charge GPU ne doit pas bloquer l'application). Il lit une vidéo ou un
flux, détecte les joueurs (YOLO), les suit (ByteTrack), convertit la position de leurs pieds en repère du terrain avec le
calibrage de la caméra, puis envoie les points à `POST /api/pistes-ia/`.

## Utilisation

```bash
cd vision
pip install -r requirements.txt            # ultralytics télécharge PyTorch et OpenCV : prévoir plusieurs Go
set SYSCOUT_MOT_DE_PASSE=...               # Linux / macOS : export
python -m syscout_vision --api http://localhost:8000 --utilisateur moteur_ia --match 29 --camera 1 --source match.mp4
```

- La caméra doit être **calibrée** (écran Caméras de l'application, FR-043) : sans calibrage, le moteur s'arrête.
- Utilisez un **compte analyste réservé** au moteur : une connexion invalide le jeton précédent du compte.
- `--pas 0.5` : une position toutes les 0,5 s par joueur. `--modele` : poids YOLO (`yolo11n.pt` par défaut).
- Un joueur dont les pieds tombent hors du terrain calibré (public, banc) est ignoré.
- Renvoyer la même vidéo est sans effet : l'API ignore un point déjà reçu (même match, piste et instant).

Les points arrivent comme **pistes non identifiées** (`T7`…). L'analyste les relie à un joueur dans « Pistes de l'IA » ; la
heatmap les présente comme non vérifiées. `temps_video` vient du rang de l'image et de ses images par seconde : pour un
flux en direct, le décalage avec la vidéo du match reste à valider.

## Limites actuelles

- Pas de classification d'équipe par couleur de maillot (FR-053) : `club` reste vide.
- Pas de détection du ballon (FR-051) ni d'événements proposés (`/api/propositions-ia/`).
- Le modèle COCO générique n'est pas entraîné sur les stades haïtiens (SRS §9.2) : la qualité doit être mesurée
  (précision, rappel, IDF1) sur un jeu annoté avant toute utilisation.
- La boucle `moteur.suivre` n'a pas été exécutée avec YOLO ici (ultralytics non installé) ; la géométrie, le
  filtrage et l'envoi par lots sont testés.

## Tests

```bash
python -m unittest discover -s tests -t .      # sans YOLO ni réseau
```
