// Entrées du menu par rôle (mêmes droits que l'application mobile : SEL 2.1 et SRS §4).
export const SPORTIFS = ['ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH'];

export interface Entree { chemin: string; libelle: string; roles: string[]; groupe: 'Analyse' | 'Gestion' | 'Administration' }

export const MENU: Entree[] = [
  { chemin: '/app', libelle: 'Tableau de bord', roles: [...SPORTIFS, 'JOUEUR', 'AGENT'], groupe: 'Analyse' },
  { chemin: '/app/joueurs', libelle: 'Joueurs', roles: SPORTIFS.filter((r) => r !== 'COACH'), groupe: 'Analyse' },
  { chemin: '/app/matchs', libelle: 'Matchs', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/comparaison', libelle: 'Comparaison', roles: SPORTIFS, groupe: 'Analyse' },
  { chemin: '/app/cameras', libelle: 'Caméras', roles: ['ADMIN', 'ANALYSTE'], groupe: 'Gestion' },
];

export const entreesPour = (role: string) => MENU.filter((e) => e.roles.includes(role));
