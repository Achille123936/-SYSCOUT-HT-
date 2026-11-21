import { C } from './theme';

export const ROLES = [
  ['ADMIN', 'Administrateur'], ['ANALYSTE', 'Analyste vidéo'], ['SCOUT', 'Scout'],
  ['DIRECTEUR', 'Directeur sportif'], ['AGENT', 'Agent commercial'], ['CLIENT', 'Club client'],
  ['CLUB_ADMIN', 'Administrateur de club'], ['COACH', 'Entraîneur'], ['JOUEUR', 'Joueur'],
];
// comptes rattachés à un club (et à son abonnement)
export const ROLES_CLUB = ['CLIENT', 'CLUB_ADMIN', 'COACH', 'JOUEUR'];
export const POSTES = [
  ['G', 'Gardien (G)'], ['DC', 'Défenseur central (DC)'], ['DL', 'Défenseur latéral (DL)'],
  ['MD', 'Milieu défensif (MD)'], ['MC', 'Milieu central (MC)'], ['MO', 'Milieu offensif (MO)'],
  ['AIL', 'Ailier (AIL)'], ['BU', 'Attaquant (BU)'],
];
export const GROUPES = [['GARDIEN', 'Gardiens'], ['DEFENSEUR', 'Défenseurs'], ['MILIEU', 'Milieux'], ['ATTAQUANT', 'Attaquants']];
export const PIEDS = [['G', 'Gauche'], ['D', 'Droit'], ['2', 'Les deux']];
export const DIVISIONS = [['D1', 'Division 1'], ['D2', 'Division 2'], ['ACADEMIE', 'Académie']];
export const CONTRATS = [['AMATEUR', 'Amateur'], ['PROFESSIONNEL', 'Professionnel'], ['PRET', 'Prêt']];
export const RECOMMANDATIONS = [['RECRUTER', 'Recruter'], ['SUIVRE', 'Suivre'], ['NE_PAS_RETENIR', 'Ne pas retenir']];
export const MODES_PAIEMENT = [['ESPECES', 'Espèces'], ['VIREMENT', 'Virement'], ['MONCASH', 'MonCash']];
export const ACTIONS_AUDIT = [
  ['CREATION', 'Création'], ['MODIFICATION', 'Modification'], ['SUPPRESSION', 'Suppression'],
  ['CONNEXION', 'Connexion'], ['ECHEC_CONNEXION', 'Connexion échouée'], ['EXPORT', 'Export'], ['SAUVEGARDE', 'Sauvegarde'],
];

// CU07 — types d'action, touche de clavier et couleur sur la ligne de temps
export const ACTIONS = [
  ['PASSE', 'Passe', 'P', C.dBlue], ['TIR', 'Tir', 'T', C.dRed], ['CENTRE', 'Centre', 'C', C.dAmber],
  ['DUEL', 'Duel', 'D', C.dGreen], ['DRIBBLE', 'Dribble', 'X', '#38bdf8'], ['INTERCEPTION', 'Interception', 'I', '#f472b6'],
  ['RECUPERATION', 'Récupération', 'R', C.dViolet], ['FAUTE', 'Faute', 'F', '#94a3b8'],
  ['BUT', 'But', 'B', '#ffd84d'], ['CARTON', 'Carton', 'K', '#fb923c'],
  // SRS §8.2 ; le remplacement (joueur entrant et sortant) se code sur le site web
  ['CORNER', 'Corner', 'O', '#a3e635'], ['HORS_JEU', 'Hors-jeu', 'H', '#e879f9'], ['ARRET', 'Arrêt du gardien', 'A', '#2dd4bf'],
];

// axes du radar et lignes du tableau des statistiques (CU09)
export const AXES_RADAR = [
  ['buts_p90', 'Buts /90'], ['xg_p90', 'xG /90'], ['tirs_p90', 'Tirs /90'], ['passes_reussies_pct', 'Passes %'],
  ['passes_p90', 'Passes /90'], ['dribbles_p90', 'Dribbles /90'], ['duels_gagnes_pct', 'Duels %'],
  ['recuperations_p90', 'Récup. /90'],
];
export const LIGNES_STATS = [
  ['matchs_joues', 'Matchs joués'], ['minutes_jouees', 'Minutes jouées'], ['buts', 'Buts'],
  ['passes_decisives', 'Passes décisives'], ['xg', 'xG'], ['tirs_p90', 'Tirs /90'],
  ['passes_reussies_pct', 'Passes réussies', '%'], ['duels_gagnes_pct', 'Duels gagnés', '%'],
  ['dribbles_p90', 'Dribbles réussis /90'], ['recuperations_p90', 'Récupérations /90'],
  ['interceptions_p90', 'Interceptions /90'],
  ['buts_tete', 'Buts de la tête'], ['tirs_tete_p90', 'Tirs de la tête /90'], ['xg_tete_p90', 'xG de la tête /90'],
];
// partie du corps d'un tir ou d'un but (CU07) : alimente les statistiques du jeu de tête
export const PARTIES_CORPS = [['PIED_D', 'Pied droit'], ['PIED_G', 'Pied gauche'], ['TETE', 'Tête']];
export const TRIS_CLASSEMENT = [
  ['indice_performance', 'Indice de performance'], ['buts', 'Buts'], ['xg', 'xG'], ['passes_decisives', 'Passes décisives'],
  ['passes_reussies_pct', 'Passes réussies %'], ['duels_gagnes_pct', 'Duels gagnés %'],
  ['recuperations_p90', 'Récupérations /90'], ['interceptions_p90', 'Interceptions /90'],
  ['buts_tete', 'Buts de la tête'], ['xg_tete_p90', 'xG de la tête /90'],
];

// couleur des badges d'état
export const TON_ETAT = {
  PLANIFIE: 'n', VIDEO_IMPORTEE: 'b', EN_CODAGE: 'a', CODE: 'b', STATS_PUBLIEES: 'g', ANNULE: 'r',
  BROUILLON: 'n', SOUMIS: 'b', RENVOYE: 'a', VALIDE: 'g', ARCHIVE: 'n',
  EN_ATTENTE: 'a', ACTIF: 'g', SUSPENDU: 'r', EXPIRE: 'n', RESILIE: 'n',
  IMPAYEE: 'r', PARTIELLE: 'a', PAYEE: 'g', ANNULEE: 'n',
};

export const libelle = (liste, cle) => (liste.find(([k]) => k === cle) || [cle, cle])[1];
export const initiales = (nom = '') => nom.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase();

// ---- formats d'affichage (SEL 3.5) : dates JJ/MM/AAAA, montants en gourdes avec deux décimales
const deux = (n) => String(n).padStart(2, '0');

export function dateFR(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

export function dateHeureFR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

// « 12/03/2009 » -> « 2009-03-12 » ; null si la saisie n'est pas une date valide
export function dateISO(fr) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((fr || '').trim());
  if (!m) return null;
  const [j, mois, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(a, mois - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== mois - 1 || d.getDate() !== j) return null;
  return `${a}-${deux(mois)}-${deux(j)}`;
}

// « 05/10/2026 15:00 » -> date ISO avec le fuseau de l'appareil
export function dateHeureISO(fr) {
  const [jour, heure = '15:00'] = (fr || '').trim().split(/\s+/);
  const iso = dateISO(jour);
  const h = /^(\d{1,2}):(\d{2})$/.exec(heure);
  if (!iso || !h || Number(h[1]) > 23 || Number(h[2]) > 59) return null;
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j, Number(h[1]), Number(h[2])).toISOString();
}

export function aujourdhuiFR() {
  const d = new Date();
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function age(dateNaissanceISO) {
  if (!dateNaissanceISO) return null;
  const [a, m, j] = dateNaissanceISO.split('-').map(Number);
  const d = new Date();
  return d.getFullYear() - a - (d.getMonth() + 1 < m || (d.getMonth() + 1 === m && d.getDate() < j) ? 1 : 0);
}

export function htg(montant) {
  const [entier, decimales] = Number(montant || 0).toFixed(2).split('.');
  return `${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimales} HTG`;
}

export const nombre = (v, suffixe = '') => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}${suffixe ? ` ${suffixe}` : ''}`);
export const chrono = (secondes) => `${deux(Math.floor(secondes / 60))}:${deux(Math.floor(secondes % 60))}`;
