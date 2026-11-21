# SYSCOUT-HT — serveur (Django + Django REST Framework)

API du système décrit dans le SEL. L'application mobile (`../syscout-ht`, React Native / Expo) s'y connecte.

## Lancer le serveur

```bash
python -m venv .venv
.venv\Scripts\activate            # Linux / macOS : source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed             # données de démonstration (efface la base)
python manage.py runserver 0.0.0.0:8000
```

Comptes de démonstration (mot de passe `Syscout2026`) :

| Compte | Rôle |
| --- | --- |
| `admin` | Administrateur |
| `jpierre` | Analyste vidéo |
| `mlindor` | Scout |
| `dsportif` | Directeur sportif |
| `agent` | Agent commercial |
| `client_ej` | Club client, abonnement Pro actif |
| `client_usc` | Club client, abonnement en attente de paiement (accès refusé, RG9) |
| `admin_ej` | Administrateur de club (Étoile de Jacmel) : ses joueurs, ses entraîneurs et comptes joueurs |
| `coach_ej` | Entraîneur (Étoile de Jacmel) : analyses, statistiques, rapports, en lecture |
| `joueur_ej` | Joueur (Étoile de Jacmel) : sa propre fiche seulement |

Les comptes d'un club (club client, administrateur de club, entraîneur, joueur) dépendent de l'abonnement actif de
leur club (RG9). Le nombre de comptes de la formule compte le personnel du club, pas les comptes « Joueur ».
Un entraîneur ou un administrateur de club voit les données personnelles des joueurs de son club seulement.

## Modules Django

| Module | Contenu | Cas d'utilisation |
| --- | --- | --- |
| `comptes` | Personne, Utilisateur, rôles, connexion | CU01, CU02 |
| `referentiel` | Club, Saison, Competition | CU03, CU04 |
| `joueurs` | Joueur, HistoriqueClub | CU05, CU09, CU10 |
| `matchs` | Match, Composition, Evenement (codage), Annotation (télestration), Possession, DonneePhysique, SuiviJoueur (suivi vidéo), Playlist (clips), suivi en direct (WebSocket), PropositionIA et ValidationEvenement (vérification des propositions de l'IA) | CU06, CU07, CU08 |
| `cameras` | Camera (flux, état, calibrage), EnregistrementVideo (caméra reliée à un match) | SRS HAITI SCOUT AI, MOD-05 |
| `statistiques` | StatistiqueJoueur, PonderationIndice | CU08, CU09 |
| `scouting` | RapportScouting, Shortlist | CU10, CU11, CU12 |
| `commercial` | Formule, Abonnement, Facture, Paiement | CU13, CU14 |
| `audit` | OperationAudit, sauvegarde | CU16 |
| `equipe` | tableau de bord de l'entraîneur (bilan, forme, effectif) et assistant qui répond aux questions | hors SEL v1.0 |
| `apprentissage` | joueurs similaires (plus proches voisins), profils de jeu (k-moyennes), modèle xG (régression logistique) | hors SEL v1.0 |
| `core` | socle commun : services (calculs, RG), droits par rôle, PDF (CU15), tableau de bord, données de démonstration, tests | — |

Chaque module a ses `models.py`, `serializers.py`, `views.py`, `urls.py` et `admin.py`. Toutes les routes sont sous `/api/`.

## Direct en temps réel (WebSocket)

`runserver` sert aussi les WebSocket (Daphne, ASGI). L'écran « Direct » ouvre `ws://<serveur>/ws/matches/{id}/live/` :

1. le client envoie `{"type": "auth", "jeton": "<jeton de connexion>"}` (jamais dans l'adresse, pour ne pas finir dans les journaux) ;
2. le serveur répond `match.snapshot` avec le tableau complet, puis pousse un message à chaque changement :
   `match.event.created` / `updated` / `deleted`, `match.score.updated`, `match.possession.updated`,
   `match.physical.updated`, `match.status.changed`, `match.updated` ;
3. le client envoie `{"type": "ping"}` chaque minute : la session reste ouverte tant que l'écran suit le match.

Chaque message porte `id` (unique, pour ignorer un doublon après reconnexion), `type`, `version` (1), `horodatage`,
`match`, `donnees`, `cle_idempotence` et `tableau`. Fermeture : 4401 (non identifié, session fermée), 4403 (accès
refusé, mêmes droits que l'API), 4404 (match introuvable). Sans WebSocket, l'application relit le tableau toutes les
5 secondes.

Synchronisation sans doublon : un événement envoyé avec `cle_idempotence` (UUID) et renvoyé après une coupure réseau
n'est enregistré qu'une fois (réponse 200 avec l'événement existant). L'écran de codage garde sur l'appareil les
événements saisis sans réseau et les envoie dès son retour.

En production avec plusieurs processus serveur : `pip install channels-redis` et `SYSCOUT_REDIS_URL=redis://hote:6379/0`
(sans cette variable, la diffusion se fait en mémoire, dans un seul processus), puis
`daphne -b 0.0.0.0 -p 8000 config.asgi:application`.

## Propositions de l'IA et vérification par l'analyste (Human-in-the-Loop)

Le moteur IA envoie ce qu'il détecte à `POST /api/propositions-ia/` (une proposition, ou un lot de 500 au plus, avec un
compte analyste ou administrateur) : `match`, `type_action`, `minute`, `temps_video`, `confiance` (0 à 1, obligatoire),
et s'il les connaît `joueur`, `club`, `piste` (identifiant de suivi), `numero_maillot`, zone, `modele`,
`cle_idempotence`. Une proposition est `PENDING` et **n'entre dans aucune statistique**.

L'analyste qui code le match décide avec `POST /api/propositions-ia/{id}/valider/` :
`{"decision": "confirmer" | "corriger" | "rejeter", "commentaire": "…", …champs corrigés}`. Confirmée ou corrigée,
elle devient un événement officiel (`source` = `AI`, `statut_validation` = `APPROVED` ou `CORRECTED`, `confiance`),
contrôlé comme une saisie. Une piste de suivi n'est pas une identité : sans joueur reconnu, il faut corriger.
Chaque décision, et chaque modification d'un événement, est gardée dans `ValidationEvenement` (qui, quand, statut et
valeurs avant/après, commentaire). À la validation du match, les propositions restées en attente deviennent
`UNVERIFIED`. Le direct indique la source des chiffres (`sources`, `propositions`).

Pour essayer sans moteur IA : `python manage.py propositions_demo <match> --nombre 8` (propositions fictives,
modèle « démonstration »), puis ouvrir le codage du match dans l'application.

## Pistes de suivi de l'IA (player_tracks)

`POST /api/pistes-ia/` (analyste ou administrateur) reçoit les points de trajectoire du moteur, un point ou un lot de
2 000 au plus : `match`, `piste` (identifiant temporaire), `temps_video` (secondes), `x` et `y` (repère normalisé
du terrain, 0 à 100), `confiance` (obligatoire), et s'il la connaît `club`, `modele`. Le lot est refusé en entier
si un point est invalide ; un point déjà reçu (même match, piste et instant) est ignoré, donc renvoyer un lot après
une coupure est sans effet. `GET /api/pistes-ia/?match=` (`&piste=`, `&joueur=`) relit les points.

Une piste n'est pas un joueur : `joueur` reste vide jusqu'à ce qu'un analyste appelle
`POST /api/pistes-ia/identifier/` `{match, piste, joueur}` (le joueur doit être dans la composition ; `joueur: null`
détache la piste). `GET /api/pistes-ia/heatmap/?match=` (`&joueur=`, `&piste=`, `&club=`, `&confiance_min=`) renvoie une grille 20 × 12
des zones d'activité, marquée `UNVERIFIED`, avec des avertissements (pistes non identifiées, confiance faible, peu de
points). Ces points n'entrent dans aucune statistique officielle. Le direct reçoit `ai.tracking.updated`
à chaque lot et à chaque identification, et `ai.detection.created` à chaque lot de propositions.

Pour essayer sans moteur IA : `python manage.py pistes_demo <match> [--pistes 6] [--points 120]` (pistes fictives
`DEMO01`…, sans joueur), puis ouvrir « Pistes de l'IA » depuis la fiche du match.

## Conformité au SRS

Voir `../documentation/CONFORMITE-SRS.md` (ce qui est fait, partiel ou absent). Ajouts liés au SRS :

- `/api/v1/…` (même routes que `/api/…`), `auth/login`, `auth/register`, `auth/logout`, `auth/refresh` (remplace le jeton).
- Événements `CORNER`, `HORS_JEU`, `ARRET` (gardien) et `REMPLACEMENT` (`joueur` entre, `joueur_lie` sort ; minutes jouées recalculées).
- Message WebSocket `match.clock.updated` à chaque événement codé.
- `GET /api/indicateurs/` (administrateur) : couverture, qualité des données, utilisation ; ce que le serveur ne mesure pas reste `null`.
- `python manage.py mesurer_nfr [--requetes 50] [--strict]` : P95 des lectures (NFR-001) et de l'écriture d'un événement (NFR-002),
  dans une transaction annulée.

## Analyse tactique

`GET /api/matchs/{id}/tactique/` (`?debut=` et `?fin=` en minutes) calcule pour chaque équipe, à partir des
événements officiels seulement : zones d'activité, positions moyennes des joueurs, formation déclarée et observée
(lignes regroupées par k-moyennes), largeur et longueur occupées, hauteur de la ligne arrière, passes progressives,
pressing (PPDA) et transitions (récupérations suivies d'un tir en 15 s). La réponse contient la définition de
chaque indicateur et des avertissements sur les limites des données : sans suivi continu des joueurs, les
positions viennent des actions avec ballon, et les passes progressives exigent un point d'arrivée codé.

## Caméras des stades

L'administrateur installe les caméras (`/api/cameras/`) : nom, stade (même libellé que le stade des matchs),
protocole (`RTSP`, `HLS` ou `HTTP`), adresse du flux, adresse de lecture, résolution et images par seconde.
L'adresse du flux peut contenir un mot de passe : elle n'est jamais relue en clair, ni dans l'API ni dans le journal.

- `POST /api/cameras/{id}/verifier/` (analyste ou administrateur) : le serveur interroge la caméra (OPTIONS en RTSP,
  premier kilo-octet en HLS/MP4) et enregistre son état (`EN_LIGNE`, `HORS_LIGNE`, `ERREUR`), son temps de réponse
  et la raison d'un échec. `GET /api/cameras/{id}/etat/` relit le dernier état sans nouvelle vérification.
- `POST /api/cameras/{id}/calibrer/` : 4 points de l'image sur un rectangle connu du terrain ; l'écran de codage
  reprend ce calibrage pour chaque match filmé par la caméra.
- `POST /api/enregistrements/` `{match, camera}` : relie une caméra active, du stade du match, libre et joignable ;
  son adresse de lecture devient la vidéo du match (ou son second angle), et le codage peut commencer.
  `POST /api/enregistrements/{id}/arreter/` la libère. Le direct reçoit `camera.connected`,
  `camera.status.changed` et `camera.disconnected`.

Une caméra RTSP n'est pas lisible directement par un navigateur ou un téléphone : un serveur de diffusion
(MediaMTX, par exemple) la convertit en HLS, dont l'adresse se met dans « adresse de lecture ».

## Vidéos : disque local ou stockage S3

`POST /api/matchs/{id}/importer-video/` accepte un fichier (`video`), l'adresse d'une vidéo hébergée (`video_url`) ou, avec un stockage S3,
la clé (`cle`) d'un fichier déjà déposé. Avec `SYSCOUT_S3_BUCKET` défini, `POST /api/matchs/{id}/televersement-video/`
`{nom, taille, type}` renvoie une adresse signée (PUT, 1 h) où le navigateur dépose la vidéo directement ; sinon `{"mode": "local"}`.
Les formats (`.mp4 .m4v .mov .webm .mkv`) et la taille (2 048 Mo, `SYSCOUT_VIDEO_MAX_MO`) sont contrôlés à l'adresse demandée et à l'arrivée.
Variables : `SYSCOUT_S3_BUCKET`, `SYSCOUT_S3_REGION`, `SYSCOUT_S3_ENDPOINT`, `SYSCOUT_S3_ACCESS_KEY`, `SYSCOUT_S3_SECRET_KEY`,
`SYSCOUT_S3_LIEN_SECONDES`. Voir `../DEPLOIEMENT.md` (CORS du bucket). Les tests S3 utilisent `moto` : `pip install -r requirements-dev.txt`.

## Tests

```bash
python manage.py test core      # SYSCOUT_DB=sqlite pour la base locale : 13 s (plusieurs minutes sur une base distante)
```

135 tests, nommés d'après les exigences de la partie IV du SEL (`test_EF1_3_blocage_apres_5_essais`, `test_EF8_2_…`, `test_ENF7_…`).

## Tâches quotidiennes

```bash
python manage.py taches_quotidiennes   # suspend les impayés de plus de 15 jours (RG10) puis sauvegarde
```

Restaurer une sauvegarde (la plus récente du disque externe, ou un fichier donné) : `python manage.py restaurer --oui`.

À planifier en fin de journée (cron ou Planificateur de tâches). Les copies vont dans `sauvegardes/disque_externe` et `sauvegardes/cloud` ; changez ces chemins dans `SYSCOUT['SAUVEGARDES']` (`config/settings.py`).

## Écarts par rapport au SEL

- Base SQLite par défaut ; PostgreSQL avec `SYSCOUT_DB=postgres` et les variables `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT` (et `PGSSLMODE=require` pour une base hébergée comme Neon). Ces réglages peuvent être mis dans `backend/.env` (une ligne `NOM=valeur` chacune, fichier ignoré par git) ; une variable d'environnement déjà définie garde la priorité.
- Serveur en Python / Django au lieu de Java / Spring Boot, et PDF avec ReportLab au lieu de JasperReports.
- Mots de passe hachés en PBKDF2 (réglage par défaut de Django) au lieu de bcrypt.
- Les courriels s'affichent dans la console du serveur ; régler `SYSCOUT_EMAIL_BACKEND` pour un vrai serveur SMTP.
- Avant la mise en production : définir `SYSCOUT_SECRET_KEY`, `SYSCOUT_DEBUG=0`, `SYSCOUT_HOSTS` et `SYSCOUT_CORS`.
