# Mettre SYSCOUT-HT en ligne (Render, sans Docker)

`render.yaml` décrit deux services : `syscout-api` (Django + WebSocket, Daphne) et `syscout-web` (site web React (`web/`)).
La base reste sur **Neon** (déjà migrée).

## Étapes

1. Sur render.com : **New › Blueprint**, autoriser GitHub, choisir ce dépôt.
2. Render demande les valeurs `sync: false` de `syscout-api`. Reprendre celles de `backend/.env` : `PGHOST`,
   `PGDATABASE`, `PGUSER`, `PGPASSWORD`. Laisser `SYSCOUT_HOSTS` et `SYSCOUT_CORS` vides pour l'instant.
3. Lancer le déploiement. Quand `syscout-api` est « Live », noter son adresse (ex. `https://syscout-api.onrender.com`).
4. Dans `syscout-web › Environment`, mettre `VITE_API_URL` = l'adresse de l'API, puis redéployer le site
   (cette valeur est inscrite dans le code au moment de la construction).
5. Dans `syscout-api › Environment` :
   - `SYSCOUT_HOSTS` = le nom de l'API sans `https://` (ex. `syscout-api.onrender.com`) ;
   - `SYSCOUT_CORS` = l'adresse du site web (ex. `https://syscout-web.onrender.com`).
   Le service redémarre. Ouvrir l'adresse du site web et se connecter.

`GET /sante/` répond `{"etat": "ok"}` quand le serveur et la base sont joignables.

## Stockage des vidéos (S3, R2, B2…)

Sans stockage objet, les vidéos importées vont sur le disque du serveur, qui **disparaît à chaque déploiement** et n'est pas servi hors
développement. Avec un stockage compatible S3 (AWS S3, Cloudflare R2, Backblaze B2, MinIO), le navigateur envoie la vidéo **directement**
au stockage (elle ne passe pas par Django) et la lecture se fait par des liens **signés et temporaires** : le bucket reste privé.

1. Créez un bucket **privé** et une clé d'accès (lecture, écriture, suppression sur ce bucket).
2. Dans `syscout-api › Environment`, renseignez : `SYSCOUT_S3_BUCKET`, `SYSCOUT_S3_ACCESS_KEY`, `SYSCOUT_S3_SECRET_KEY`, et selon le
   fournisseur `SYSCOUT_S3_REGION` (AWS : `us-east-1`… ; R2 : `auto`) et `SYSCOUT_S3_ENDPOINT` (R2 : `https://<compte>.r2.cloudflarestorage.com`,
   B2 : `https://s3.<région>.backblazeb2.com` ; vide pour AWS). Facultatif : `SYSCOUT_S3_LIEN_SECONDES` (durée des liens, 3600 par défaut)
   et `SYSCOUT_VIDEO_MAX_MO` (2048 par défaut).
3. Autorisez le site web à écrire dans le bucket (CORS du bucket) :

```json
[{"AllowedOrigins": ["https://achille123936.github.io"], "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["Content-Type"], "ExposeHeaders": [], "MaxAgeSeconds": 3600}]
```

Si vous laissez `SYSCOUT_S3_BUCKET` vide, rien ne change : disque du serveur. Les vidéos déjà importées avant d'activer S3 ne sont pas déplacées.
Les flux HLS (`.m3u8`) se lisent dans tous les navigateurs (hls.js) ; un flux RTSP doit d'abord être converti en HLS (voir `vision/README.md`).

## À savoir

- **Formule gratuite** : le service s'endort après 15 minutes sans visite (premier chargement lent, WebSocket coupé) et
  ses fichiers disparaissent à chaque déploiement.
- **Vidéos importées** : voir « Stockage des vidéos » ci-dessus ; sans S3, elles disparaissent à chaque déploiement.
- **Plusieurs instances** : la diffusion du direct est en mémoire ; ajouter Redis et `SYSCOUT_REDIS_URL` (voir
  `backend/README.md`).
- **Courriels** : ils s'affichent dans les journaux tant que `SYSCOUT_EMAIL_BACKEND` n'est pas réglé.
- **Comptes de démonstration** (mot de passe `Syscout2026`) : si la base Neon contient les données du `seed`, changer ou
  désactiver ces mots de passe avant d'ouvrir le site au public.
- **Moteur de vision** (`vision/`) : service à part, à lancer sur une machine avec GPU ; il se connecte à l'adresse
  publique de l'API.

## Variante : API sur Railway (sans Docker)

`backend/railway.json` décrit la construction et le démarrage (même commande que Render).

1. Sur railway.com : **New Project › Deploy from GitHub repo**, choisir ce dépôt, puis dans **Settings › Root Directory** mettre `backend`.
2. Dans **Variables**, saisir : `SYSCOUT_DEBUG=0`, `SYSCOUT_SECRET_KEY` (longue valeur aléatoire), `SYSCOUT_DB=postgres`, `PGHOST`, `PGDATABASE`,
   `PGUSER`, `PGPASSWORD`, `PGPORT=5432`, `PGSSLMODE=require` (valeurs Neon de `backend/.env`), et `PYTHON_VERSION=3.12`.
3. **Settings › Networking › Generate Domain** : noter l'adresse (ex. `syscout-api.up.railway.app`).
4. Ajouter `SYSCOUT_HOSTS` = cette adresse sans `https://`, et `SYSCOUT_CORS` = l'adresse du site web (ex. `https://syscout-ht.netlify.app`).
5. Sur le site web, `VITE_API_URL` = `https://<adresse Railway>`, puis reconstruire et redéployer le site.

## Assistant IA (Claude)

L'écran **Assistant** propose une case « Réponse par intelligence artificielle ». Elle appelle `POST /api/assistant/ia/` : le serveur
retrouve des passages de données autorisées pour l'utilisateur (connaissances de base, définitions, statistiques des joueurs
visibles, résultats), puis demande à l'API Claude d'y répondre en citant ses sources `[J12]`, `[K3]`…

- Variable `ANTHROPIC_API_KEY` (Render › Environment), jamais dans le dépôt. `SYSCOUT_LLM_MODELE` change le modèle (`claude-opus-5-5` par défaut).
- **Confidentialité** : la question et les passages sont envoyés à Anthropic. Aucune donnée de joueur mineur n'est jamais incluse (RG12).
- **Coût** : chaque question est facturée par jeton ; limite de 30 questions par heure et par utilisateur.
- Sans clé, l'assistant à règles (case décochée) continue de fonctionner.
