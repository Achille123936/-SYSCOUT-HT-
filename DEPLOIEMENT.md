# Mettre SYSCOUT-HT en ligne (Render, sans Docker)

`render.yaml` décrit deux services : `syscout-api` (Django + WebSocket, Daphne) et `syscout-web` (application web Expo).
La base reste sur **Neon** (déjà migrée).

## Étapes

1. Sur render.com : **New › Blueprint**, autoriser GitHub, choisir ce dépôt.
2. Render demande les valeurs `sync: false` de `syscout-api`. Reprendre celles de `backend/.env` : `PGHOST`,
   `PGDATABASE`, `PGUSER`, `PGPASSWORD`. Laisser `SYSCOUT_HOSTS` et `SYSCOUT_CORS` vides pour l'instant.
3. Lancer le déploiement. Quand `syscout-api` est « Live », noter son adresse (ex. `https://syscout-api.onrender.com`).
4. Dans `syscout-web › Environment`, mettre `EXPO_PUBLIC_API_URL` = l'adresse de l'API, puis redéployer le site
   (cette valeur est inscrite dans le code au moment de la construction).
5. Dans `syscout-api › Environment` :
   - `SYSCOUT_HOSTS` = le nom de l'API sans `https://` (ex. `syscout-api.onrender.com`) ;
   - `SYSCOUT_CORS` = l'adresse du site web (ex. `https://syscout-web.onrender.com`).
   Le service redémarre. Ouvrir l'adresse du site web et se connecter.

`GET /sante/` répond `{"etat": "ok"}` quand le serveur et la base sont joignables.

## À savoir

- **Formule gratuite** : le service s'endort après 15 minutes sans visite (premier chargement lent, WebSocket coupé) et
  ses fichiers disparaissent à chaque déploiement.
- **Vidéos importées et `media/`** : le disque de Render est éphémère et Django ne sert `media/` qu'en mode
  développement. Pour de vraies vidéos, utiliser un stockage objet compatible S3 (SRS §5.1) ; cela reste à faire.
- **Plusieurs instances** : la diffusion du direct est en mémoire ; ajouter Redis et `SYSCOUT_REDIS_URL` (voir
  `backend/README.md`).
- **Courriels** : ils s'affichent dans les journaux tant que `SYSCOUT_EMAIL_BACKEND` n'est pas réglé.
- **Comptes de démonstration** (mot de passe `Syscout2026`) : si la base Neon contient les données du `seed`, changer ou
  désactiver ces mots de passe avant d'ouvrir le site au public.
- **Moteur de vision** (`vision/`) : service à part, à lancer sur une machine avec GPU ; il se connecte à l'adresse
  publique de l'API.
