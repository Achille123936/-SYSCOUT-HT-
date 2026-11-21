# SYSCOUT-HT — site web (React)

Site web desktop de SYSCOUT-HT : React 18, TypeScript, Vite, Tailwind CSS et React Router. Il parle à l'API Django du dossier
`../backend` (les mêmes comptes, les mêmes droits par rôle que l'application mobile).

## Lancer

```bash
cd web
npm install
npm run dev            # http://localhost:5173 ; l'API est attendue sur http://localhost:8000
npm run build          # vérifie les types (tsc) puis construit dist/
```

Autre serveur : `VITE_API_URL=https://syscout-api.onrender.com npm run build` (voir `.env.example`). Sous un sous-chemin
(GitHub Pages) : `VITE_BASE=/nom-du-depot/`. Comptes de démonstration (mot de passe `Syscout2026`) : `admin`, `jpierre`
(analyste), `mlindor` (scout), `dsportif`, `coach_ej`.

## Pages (toutes branchées sur l'API Django, droits par rôle comme l'application mobile)

| Route | Contenu |
| --- | --- |
| `/`, `/connexion`, `/inscription` | accueil public (matchs en direct, offres), connexion, demande d'inscription |
| `/app` | tableau de bord par rôle, matchs en direct |
| `/app/joueurs`, `/:id`, `/nouveau`, `/:id/modifier` | recherche multicritère, fiche (statistiques, radar, carte, historique, PDF, shortlist), formulaire (mineur : tuteur et accord écrit en fichier) |
| `/app/comparaison` | de 2 à 5 joueurs, radar, avertissement sous 450 minutes, PDF |
| `/app/matchs`, `/:id`, `/nouveau`, `/:id/modifier` | liste, fiche, formulaire avec compositions et adresse de la vidéo, correction, annulation |
| `/app/matchs/:id/codage` | codage vidéo : verrou renouvelé, action au clic sur le terrain (passes : départ et arrivée), file locale et clé d'idempotence, validation du match |
| `/app/matchs/:id/relecture` | vidéo, actions filtrées, playlists |
| `/app/matchs/:id/direct` | direct en WebSocket (secours : relecture toutes les 5 s) |
| `/app/matchs/:id/tactique` | zones, positions moyennes, formation, bloc, pressing, transitions, avertissements |
| `/app/matchs/:id/verification-ia`, `/pistes-ia` | confirmer, corriger ou rejeter les propositions de l'IA ; heatmap et identification des pistes |
| `/app/matchs/:id/physique` | données physiques (lecture, saisie manuelle) |
| `/app/classements`, `/championnat`, `/equipe`, `/assistant`, `/apprentissage` | statistiques par poste, classement des équipes, tableau de l'entraîneur, assistant, joueurs similaires / profils / xG |
| `/app/rapports`, `/shortlists` | rapports de scouting (brouillon, soumission, validation, PDF), listes de joueurs |
| `/app/clubs`, `/competitions`, `/cameras`, `/abonnements` | référentiel, caméras, abonnements, factures et paiements |
| `/app/utilisateurs`, `/audit`, `/compte` | comptes et droits, journal et sauvegardes, mot de passe |

## Fonctions ajoutées depuis l'application mobile

- **Caméras** (`/app/cameras`) : création et modification (l'adresse du flux ne se relit pas : vide = inchangée), vérification,
  **calibrage des 4 coins** cliqués sur l'image de la caméra (ou saisis à la main si elle n'a pas d'adresse de lecture).
- **Télestration** (`/app/matchs/:id/relecture`, mode « Dessiner ») : 13 formes (flèche, ligne, courbe, cercle, ovale, zone,
  projecteur, distance, liaisons, polygone, trait libre, texte, étiquette joueur avec vitesse), couleur et durée ; les dessins
  réapparaissent à leur instant ; distances **en mètres** une fois le terrain calibré (mode « Calibrer le terrain »).
- **Suivi vidéo d'un joueur** (mode « Suivre un joueur ») : on clique sur le joueur image après image ; le trajet est converti
  en mètres (distance, sprints, vitesse maximale) et cumulé dans ses données physiques.
- **Capteur GPS** (`/app/matchs/:id/capteur`) : enregistrement avec la géolocalisation du navigateur (HTTPS ou localhost
  exigé) ou import d'un fichier GPX / CSV.

## Limites

Les vidéos en flux HLS exigent un navigateur qui les lit (Safari) ; un flux RTSP doit d'abord être converti en HLS (voir
`../vision/README.md`). Un navigateur sur ordinateur n'est pas un capteur porté : le GPS est surtout utile avec un téléphone.

Ces pages ont été vérifiées par le compilateur TypeScript, la construction Vite et des appels réels à l'API avec leurs
vraies charges utiles ; elles n'ont pas été parcourues à la main dans un navigateur.
