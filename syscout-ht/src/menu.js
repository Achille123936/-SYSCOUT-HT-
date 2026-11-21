// Menu adapté au rôle (SEL 2.1) : onglets du bas par rôle, et entrées du menu « Plus »
const SPORTIF = ['Accueil', 'Joueurs', 'Rapports', 'Classements', 'Plus'];

export const ONGLETS_PAR_ROLE = {
  ADMIN: ['Accueil', 'Joueurs', 'Matchs', 'Rapports', 'Plus'],
  ANALYSTE: ['Accueil', 'Joueurs', 'Matchs', 'Classements', 'Plus'],
  SCOUT: SPORTIF,
  DIRECTEUR: SPORTIF,
  CLIENT: SPORTIF,
  // SRS HAITI SCOUT AI §4 : membres d'un club
  CLUB_ADMIN: ['Accueil', 'Joueurs', 'Membres', 'Matchs', 'Plus'],
  COACH: ['Accueil', 'Equipe', 'Matchs', 'Classements', 'Plus'],
  JOUEUR: ['Accueil', 'MaFiche', 'Plus'],
  AGENT: ['Accueil', 'Clubs', 'Abonnements', 'Plus'],
};

const SPORTIFS = ['ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH'];

// [écran, libellé, description, rôles autorisés]
export const MENU = [
  ['Equipe', 'Mon équipe', "Tableau de bord de l'entraîneur : bilan, forme, effectif", SPORTIFS],
  ['Assistant', 'Assistant', 'Posez une question sur un joueur, une équipe, un match', SPORTIFS],
  ['Championnat', 'Championnat', 'Classement des équipes par compétition', SPORTIFS],
  ['Matchs', 'Matchs', 'Rencontres, compositions et codage vidéo', SPORTIFS],
  ['Classements', 'Statistiques', 'Classements par poste', SPORTIFS],
  ['Rapports', 'Rapports', 'Rapports de scouting', SPORTIFS],
  ['Apprentissage', 'Apprentissage', 'Profils de jeu et modèle xG', SPORTIFS],
  ['Shortlists', 'Shortlists', 'Listes de joueurs suivis', ['ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH']],
  ['Clubs', 'Clubs', 'Clubs de D1, D2 et académies', ['ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR', 'AGENT']],
  ['Competitions', 'Compétitions', 'Compétitions et saisons', ['ADMIN', 'ANALYSTE']],
  ['Cameras', 'Caméras', 'Caméras des stades : état du flux et configuration', ['ADMIN', 'ANALYSTE']],
  ['Abonnements', 'Abonnements', 'Clubs clients, factures et paiements', ['ADMIN', 'AGENT']],
  ['Membres', 'Membres du club', 'Comptes des entraîneurs et des joueurs du club', ['CLUB_ADMIN']],
  ['Utilisateurs', 'Administration › Utilisateurs', 'Comptes, rôles et droits', ['ADMIN']],
  ['Audit', 'Administration › Journal', "Journal d'audit et sauvegarde", ['ADMIN']],
];
