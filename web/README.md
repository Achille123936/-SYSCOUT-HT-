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

## Pages déjà faites

| Route | Contenu | API |
| --- | --- | --- |
| `/` | accueil public : chiffres, matchs en direct, offres | `/chiffres-publics/`, `/matchs-en-direct/`, `/formules-publiques/` |
| `/connexion` | connexion, « rester connecté », session fermée après inactivité | `/auth/connexion/`, `/auth/moi/` |
| `/app` | tableau de bord par rôle, matchs en direct | `/tableau-de-bord/` |
| `/app/joueurs`, `/app/joueurs/:id` | recherche multicritère, fiche (statistiques, radar des centiles, carte des actions, historique, PDF) | `/joueurs/…` |
| `/app/comparaison?ids=1,2,3` | de 2 à 5 joueurs, radar, tableau, avertissement sous 450 minutes, PDF | `/joueurs/comparer/` |
| `/app/matchs`, `/app/matchs/:id` | liste filtrée, fiche et compositions | `/matchs/` |
| `/app/matchs/:id/direct` | direct en WebSocket (secours : relecture toutes les 5 s) | `/ws/matches/{id}/live/`, `/matchs/{id}/direct/` |
| `/app/matchs/:id/pistes-ia` | heatmap des pistes de l'IA, identification d'une piste à un joueur | `/pistes-ia/…` |
| `/app/cameras` | état des caméras, vérification | `/cameras/` |

## Reste à faire (présent dans l'application mobile)

Codage vidéo et télestration, relecture et clips, analyse tactique, vérification des propositions de l'IA, capteur GPS et
données physiques, classements et championnat, rapports de scouting et shortlists, clubs, compétitions et saisons,
abonnements, factures et paiements, administration (utilisateurs, journal, sauvegarde), « Mon équipe » et assistant,
apprentissage (joueurs similaires, profils, xG), formulaire de joueur et de match, inscription, mot de passe.
