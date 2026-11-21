# Conformité au SRS HAITI SCOUT AI v1.0

État au 21 novembre 2026. **Fait** = codé et couvert par un test ou une vérification décrite ; **Partiel** = une partie seulement ;
**Non fait** = absent. Les écarts de technologie sont à la fin. Rien ici n'a été essayé sur un stade, une caméra ou un appareil
Android réels.

## Exigences fonctionnelles (§6)

| ID | État | Où / ce qui manque |
| --- | --- | --- |
| FR-001 à FR-003 | Fait | comptes, connexion (blocage après 5 essais), rôles : `comptes/`, `core/auth.py` |
| FR-004 | Partiel | réinitialisation par l'administrateur (mot de passe provisoire) ; pas de lien par courriel en libre-service |
| FR-010 à FR-012 | Fait | clubs, joueurs, historique des clubs |
| FR-020 à FR-022 | Fait | compétitions, saisons, matchs, résultats |
| FR-030, FR-031 | Fait | ouverture du codage (verrou), liaison d'une caméra à un match (`/api/enregistrements/`) |
| FR-032 | Partiel | score et minute en temps réel, message `match.clock.updated` ; pas de chronomètre qui tourne seul |
| FR-033 à FR-036 | Fait | saisie, joueur et équipe, WebSocket, sauvegarde à chaque saisie |
| FR-040 à FR-043 | Fait | caméras (création, état, résolution, i/s), calibrage des 4 coins (web et mobile) |
| FR-050 | Partiel | `vision/` détecte les personnes (YOLO) ; **jamais exécuté** avec les poids (ultralytics non installé ici) |
| FR-051 | Non fait | détection du ballon ; seule la mesure de sa qualité existe (`evaluation.evaluer_ballon`) |
| FR-052 | Fait | pistes de suivi (`PisteJoueur`, `/api/pistes-ia/`), jamais confondues avec un joueur |
| FR-053 | Non fait | classification d'équipe par maillot (le champ `club` d'une piste reste vide) |
| FR-054, FR-055 | Fait | positions dans le repère du terrain, heatmaps avec avertissements |
| FR-056, FR-057 | Fait | confiance affichée ; confirmer, corriger, rejeter (`PropositionIA`) |
| FR-060, FR-061 | Partiel | profil et recherche par poste, âge, club, division, indice ; **pas de filtre par compétition ni par saison** |
| FR-062 | Fait | comparaison de 2 à 5 joueurs, minutes jouées en contexte |
| FR-063 | Partiel | rapports et statistiques liés au joueur ; pas de vidéo rattachée à un joueur ni de clips dans un rapport |
| FR-064, FR-072 | Fait | rapport de scouting, export PDF |
| FR-070 | Partiel | playlists de clips par critères ; pas de clip avec début et fin explicites |
| FR-071 | Fait | 13 formes de télestration |

## Événements (§8.2, §10, §15.1)

Passe, tir, but, faute, interception, carton : faits. **Ajoutés ce jour** : corner, hors-jeu, arrêt (gardien seulement),
remplacement (joueur entrant et sortant, les minutes jouées sont recalculées). Statuts PENDING, APPROVED, CORRECTED, REJECTED,
UNVERIFIED et audit de chaque décision (utilisateur, date, avant, après, commentaire) : faits. Règles d'intégrité de §15.1 : faites.

## Exigences non fonctionnelles (§7)

| ID | État | Remarque |
| --- | --- | --- |
| NFR-001, NFR-002 | Mesuré en local | `python manage.py mesurer_nfr` : P95 de 13 à 265 ms (API) et 13 ms (écriture d'un événement) sur SQLite, en local. **À refaire sur l'environnement de référence** ; la diffusion WebSocket n'est pas incluse |
| NFR-003 | Non mesuré | latence vidéo de bout en bout : exige une caméra et un réseau réels |
| NFR-004 | Non mesuré | `GET /sante/` sert à la supervision de l'hébergeur |
| NFR-005 | Fait | le moteur IA est un service séparé ; les événements s'enregistrent sans lui |
| NFR-006 | Partiel | site web et application Expo ; pas essayés sur des appareils Android |
| NFR-007 | Non fait | pas de file Celery/Redis : validation d'un match et calculs lourds s'exécutent dans la requête |
| NFR-008 | Fait | clé d'idempotence, file locale sur l'appareil (web et mobile) |

## Critères d'acceptation (§21)

AC-001, AC-002, AC-003, AC-005, AC-006, AC-008, AC-009, AC-010, AC-012 : faits (tests `core/tests.py`).
AC-004 : le flux est vérifié et horodaté côté serveur ; **un flux exploitable réel reste à essayer**. AC-007 : l'outil de mesure
existe, **aucun jeu de test annoté n'existe**. AC-011 : **non testé sur appareils**.

## Indicateurs de réussite (§2.1) et IA (§9.2, §20)

`GET /api/indicateurs/` et la page « Indicateurs de réussite » : couverture, qualité des données, utilisation. La performance de
l'IA et la disponibilité restent vides et le disent. `vision/syscout_vision/evaluation.py` : précision, rappel, F1, IDF1, MOTA,
suivi du ballon, et contrôle de la séparation entraînement / validation / test (12 tests, valeurs vérifiées à la main).
**Non fait** : constituer et annoter les vidéos des stades haïtiens, entraîner un modèle.

## API (§16) et interface (§17)

Préfixe `/api/v1/` (alias de `/api/`), `auth/login`, `register`, `logout`, `refresh` (le jeton est remplacé). Les autres routes
gardent leurs noms français (`/matchs/`, `/joueurs/`…) au lieu de `/matches/`, `/players/`. Messages WebSocket du SRS : tous
émis (`match.clock.updated`, `match.score.updated`, `match.event.created/validated`, `camera.status.changed`,
`ai.detection.created`, `ai.tracking.updated`), avec identifiant, horodatage, version et clé d'idempotence.
Palette du §17.1 reprise par le site web. **Langues** : interface en français ; aide en créole dans l'application mobile ;
**pas d'interface en anglais ni de sélecteur de langue**.

## Vidéo (§13) et sécurité (§18)

| Sujet | État |
| --- | --- |
| Lecture, timeline, recherche par événement et joueur, annotations | Fait |
| Lien entre horodatage vidéo et horloge du match | Non fait (pas de décalage de coup d'envoi ni de mi-temps) |
| Droits, conservation et téléchargement des vidéos | Non fait |
| Liens vidéo privés et temporaires | Non fait (les exports PDF ont un lien signé et temporaire ; pas les vidéos) |
| Stockage objet compatible S3 | Non fait (disque local ; `media/` n'est pas servi hors développement) |
| HTTPS, mots de passe hachés (PBKDF2), RBAC, jeton à inactivité de 20 min, audit, protection des mineurs | Fait |
| Sauvegardes **chiffrées** | Non fait (sauvegardes JSON en clair) |
| Validation et limites de taille des fichiers importés | Non vérifié : aucune limite réglée dans `settings.py` |
| Exigences légales (Haïti et pays partenaires) | À examiner avant la production, comme le dit le SRS |

## Écarts de technologie (§5.1, §15, §19)

- **Web** : React + Vite + TypeScript + Tailwind au lieu de Next.js (choisi avec le demandeur).
- **Base** : identifiants entiers au lieu d'UUID ; PostGIS non utilisé (positions en pourcentages du terrain).
- **Docker** : refusé par le demandeur ; déploiement par Render (`render.yaml`) sans conteneur. Pas d'environnement de *staging*.
- **Celery/Redis** : absents (voir NFR-007). Redis est prévu pour la diffusion multi-processus (`SYSCOUT_REDIS_URL`).
- **Android** : application Expo (React Native), pas de compilation ni de test sur appareil.
