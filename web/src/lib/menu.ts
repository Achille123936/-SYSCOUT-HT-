// Entrées du menu par rôle (mêmes droits que l'application mobile : SEL 2.1 et SRS §4).
export const SPORTIFS = ['ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH'];

export interface Entree { chemin: string; libelle: string; roles: string[]; groupe: 'Analyse' | 'Scouting' | 'Gestion' | 'Administration' }

export const MENU: Entree[] = [
  { chemin: '/app', libelle: 'Tableau de bord', roles: [...SPORTIFS, 'JOUEUR', 'AGENT'], groupe: 'Analyse' },
  { chemin: '/app/equipe', libelle: 'Mon équipe', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/joueurs', libelle: 'Joueurs', roles: SPORTIFS.filter((r) => r !== 'COACH'), groupe: 'Analyse' },
  { chemin: '/app/matchs', libelle: 'Matchs', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/championnat', libelle: 'Championnat', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/classements', libelle: 'Statistiques', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/comparaison', libelle: 'Comparaison', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/apprentissage', libelle: 'Apprentissage', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/assistant', libelle: 'Assistant', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/scout', libelle: 'Interface Scout (vidéo)', roles: SPORTIFS, groupe: 'Scouting' },
  { chemin: '/app/rapports', libelle: 'Rapports', roles: SPORTIFS, groupe: 'Scouting' },
  { chemin: '/app/shortlists', libelle: 'Shortlists', roles: ['ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH'], groupe: 'Scouting' },
  { chemin: '/app/clubs', libelle: 'Clubs', roles: ['ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR', 'AGENT'], groupe: 'Gestion' },
  { chemin: '/app/competitions', libelle: 'Compétitions', roles: ['ADMIN', 'ANALYSTE'], groupe: 'Gestion' },
  { chemin: '/app/cameras', libelle: 'Caméras', roles: ['ADMIN', 'ANALYSTE'], groupe: 'Gestion' },
  { chemin: '/app/abonnements', libelle: 'Abonnements', roles: ['ADMIN', 'AGENT'], groupe: 'Gestion' },
  { chemin: '/app/utilisateurs', libelle: 'Utilisateurs', roles: ['ADMIN'], groupe: 'Administration' },
  { chemin: '/app/indicateurs', libelle: 'Indicateurs de réussite', roles: ['ADMIN'], groupe: 'Administration' },
  { chemin: '/app/audit', libelle: 'Journal et sauvegardes', roles: ['ADMIN'], groupe: 'Administration' },
  { chemin: '/app/compte', libelle: 'Mon compte', roles: [...SPORTIFS, 'JOUEUR', 'AGENT'], groupe: 'Administration' },
];

export const entreesPour = (role: string) => MENU.filter((e) => e.roles.includes(role));
