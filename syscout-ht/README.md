# SYSCOUT-HT — application (React Native / Expo)

Application des utilisateurs de SYSCOUT-HT. Elle se connecte au serveur Django du dossier `../backend`.

## Lancer l'application

```bash
# 1. le serveur (voir ../backend/README.md)
cd ../backend && .venv\Scripts\activate && python manage.py runserver 0.0.0.0:8000

# 2. l'application
npm install
npx expo start          # puis scanner le QR code avec Expo Go (Android / iOS)
npx expo start --web    # ou dans le navigateur
```

Par défaut l'application appelle le serveur sur la machine qui la sert, port 8000 (le téléphone et l'ordinateur doivent être sur le même réseau Wi-Fi). Pour un autre serveur :

```bash
EXPO_PUBLIC_API_URL=https://syscout.exemple.ht npx expo start
```

Comptes de démonstration (mot de passe `Syscout2026`) : `admin`, `jpierre` (analyste), `mlindor` (scout), `dsportif` (directeur sportif), `agent`, `client_ej`, `client_usc`.

## Écrans

| Écran | Fichier (`src/screens/`) | Cas d'utilisation |
| --- | --- | --- |
| Connexion | `LoginScreen.js` | CU01 |
| Tableau de bord selon le rôle | `AccueilScreen.js` | — |
| Utilisateurs, journal et sauvegarde | `AdminScreens.js` | CU02, CU16 |
| Clubs, compétitions, saisons | `ReferentielScreens.js` | CU03, CU04 |
| Recherche de joueurs, fiche, formulaire | `JoueursScreen.js`, `JoueurDetailScreen.js`, `JoueurScreen.js` | CU05, CU10 |
| Matchs, fiche (statistiques et carte des passes), formulaire | `MatchsScreen.js`, `MatchDetailScreen.js`, `MatchScreen.js` | CU06 |
| Codage vidéo (départ et arrivée des passes), possession, télestration (flèches, liaisons, triangles, distances en mètres, étiquettes joueur), suivi d'un joueur | `CodageScreen.js` | CU07, CU08 |
| Relecture de la vidéo : clips, playlist et dessins | `RelectureScreen.js` | — |
| Match en direct, données physiques | `DirectScreens.js` | — |
| Capteur GPS (le téléphone porté par le joueur) | `CapteurScreen.js` | — |
| Comparaison de 2 à 5 joueurs (radar, statistiques, minutes jouées, PDF), classements | `ComparaisonScreen.js`, `ClassementsScreen.js` | CU09 |
| Pistes de suivi de l'IA : heatmap non vérifiée, identification d'une piste à un joueur | `PistesIAScreen.js` | FR-052, FR-055 |
| Rapports de scouting | `RapportsScreens.js` | CU11, CU12 |
| Shortlists | `ShortlistsScreens.js` | CU10 |
| Abonnements, factures, paiements | `AbonnementsScreens.js` | CU13, CU14 |
| Joueurs similaires, profils de jeu, modèle xG | `IAScreen.js` | — |
| Équipe de l'entraîneur, assistant | `EquipeScreens.js` | — |
| Menu, mot de passe, aide en français et en créole | `PlusScreen.js` | — |

L'export PDF (CU15) est un bouton des fiches joueur, comparaisons, rapports, factures et reçus.

Le reste du code : `src/api.js` (appels au serveur), `src/auth.js` (session), `src/menu.js` (menu par rôle), `src/components/` (composants communs, radar, télestration), `src/aide.js` (textes d'aide), `src/theme.js` (couleurs).
