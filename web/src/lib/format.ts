export const dateFR = (d?: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateHeureFR = (d?: string | null) =>
  d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const nombre = (v: unknown, unite = '') => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}${unite ? ` ${unite}` : ''}`);

export const GROUPES: [string, string][] = [['GARDIEN', 'Gardiens'], ['DEFENSEUR', 'Défenseurs'], ['MILIEU', 'Milieux'], ['ATTAQUANT', 'Attaquants']];

// [clé, libellé, unité]
export const LIGNES_STATS: [string, string, string?][] = [
  ['matchs_joues', 'Matchs joués'], ['minutes_jouees', 'Minutes jouées'], ['buts', 'Buts'],
  ['passes_decisives', 'Passes décisives'], ['xg', 'xG'], ['tirs_p90', 'Tirs /90'],
  ['passes_reussies_pct', 'Passes réussies', '%'], ['duels_gagnes_pct', 'Duels gagnés', '%'],
  ['dribbles_p90', 'Dribbles réussis /90'], ['recuperations_p90', 'Récupérations /90'],
  ['interceptions_p90', 'Interceptions /90'], ['buts_tete', 'Buts de la tête'],
  ['tirs_tete_p90', 'Tirs de la tête /90'], ['xg_tete_p90', 'xG de la tête /90'],
];

export const ETATS_MATCH: [string, string][] = [
  ['PLANIFIE', 'Planifié'], ['VIDEO_IMPORTEE', 'Vidéo importée'], ['EN_CODAGE', 'En codage'], ['CODE', 'Codé'],
  ['STATS_PUBLIEES', 'Statistiques publiées'], ['ANNULE', 'Annulé'],
];
export const TON_ETAT: Record<string, Ton> = {
  PLANIFIE: 'gris', VIDEO_IMPORTEE: 'bleu', EN_CODAGE: 'orange', CODE: 'bleu', STATS_PUBLIEES: 'vert', ANNULE: 'rouge',
  EN_LIGNE: 'vert', HORS_LIGNE: 'rouge', ERREUR: 'rouge', NON_TESTEE: 'gris',
};
export type Ton = 'gris' | 'vert' | 'bleu' | 'orange' | 'rouge';

/** Détails facultatifs d'une action (mêmes codes et mêmes types que backend/matchs/models.py). */
export const QUALIFICATIFS: Record<string, { libelle: string; types: string[] }> = {
  PASSE_CLE: { libelle: 'Passe clé', types: ['PASSE', 'CENTRE'] },
  PASSE_PROFONDEUR: { libelle: 'Passe en profondeur', types: ['PASSE'] },
  PASSE_INTELLIGENTE: { libelle: 'Passe intelligente', types: ['PASSE'] },
  COMBINAISON_MILIEU: { libelle: 'Combinaison avec le milieu', types: ['PASSE'] },
  ACCELERATION: { libelle: 'Accélération', types: ['DRIBBLE'] },
  DUEL_AERIEN: { libelle: 'Duel aérien', types: ['DUEL'] },
  DUEL_OFFENSIF: { libelle: 'Duel offensif', types: ['DUEL', 'DRIBBLE'] },
  FAUTE_PROVOQUEE: { libelle: 'Faute provoquée', types: ['DUEL', 'DRIBBLE'] },
};

/** Phases du tableau de codage (mêmes codes et étiquettes que backend/matchs/models.py). */
export const CATEGORIES_MARQUE: Record<string, { libelle: string; couleur: string; etiquettes: string[] }> = {
  ATTAQUE: { libelle: 'Attaque', couleur: '#1D8A55', etiquettes: ['Jeu long', 'Construction', 'Côté gauche', 'Côté droit', 'Axe', 'Occasion'] },
  DEFENSE: { libelle: 'Défense', couleur: '#B8323A', etiquettes: ['Bloc haut', 'Bloc médian', 'Bloc bas', 'Pressing', 'Erreur'] },
  TRANSITION_OFF: { libelle: 'Transition offensive', couleur: '#0E7C86', etiquettes: ['Contre-attaque', 'Conservation', 'Occasion'] },
  TRANSITION_DEF: { libelle: 'Transition défensive', couleur: '#8A4B1D', etiquettes: ['Contre-pressing', 'Repli', 'Faute tactique'] },
  COUP_ARRETE: { libelle: 'Coup de pied arrêté', couleur: '#5A4FB0', etiquettes: ['Corner', 'Coup franc', 'Touche', 'Penalty', 'Pour', 'Contre'] },
  MOMENT_FORT: { libelle: 'Moment fort', couleur: '#8A7A00', etiquettes: ['À montrer', 'À travailler'] },
};

export const TYPES_ACTION: Record<string, string> = {
  PASSE: 'Passe', TIR: 'Tir', BUT: 'But', DRIBBLE: 'Dribble', DUEL: 'Duel', INTERCEPTION: 'Interception',
  RECUPERATION: 'Récupération', CENTRE: 'Centre', FAUTE: 'Faute', CARTON: 'Carton',
  CORNER: 'Corner', HORS_JEU: 'Hors-jeu', ARRET: 'Arrêt du gardien', REMPLACEMENT: 'Remplacement',
};
