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

export const TYPES_ACTION: Record<string, string> = {
  PASSE: 'Passe', TIR: 'Tir', BUT: 'But', DRIBBLE: 'Dribble', DUEL: 'Duel', INTERCEPTION: 'Interception',
  RECUPERATION: 'Récupération', CENTRE: 'Centre', FAUTE: 'Faute', CARTON: 'Carton',
};
