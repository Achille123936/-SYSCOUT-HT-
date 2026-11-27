// Catégories de la liste des actions : toutes se calculent à partir des événements codés (aucune donnée inventée).
// « Passes progressives » suit la définition de backend/matchs/tactique.py ; « avant un but » est déduite.

import { QUALIFICATIFS } from '../lib/format';

export interface Categorie { id: string; libelle: string; aide?: string; filtre: (e: any, tous: any[]) => boolean }

const L = 105, H = 68, FENETRE_AVANT_BUT = 10; // secondes

function progressive(e: any) {
  if (e.type_action !== 'PASSE' || !e.resultat || e.fin_x == null || e.fin_y == null) return false;
  const x1 = (e.zone_x * L) / 100, y1 = (e.zone_y * H) / 100, x2 = (e.fin_x * L) / 100, y2 = (e.fin_y * H) / 100;
  const gain = Math.hypot(L - x1, H / 2 - y1) - Math.hypot(L - x2, H / 2 - y2);
  const milieu = L / 2;
  return gain >= (x2 < milieu ? 30 : x1 < milieu ? 15 : 10);
}
/** Surface de réparation adverse : 16,5 m de profondeur, 40,3 m de largeur. */
const dansLaSurface = (x: number, y: number) => x >= ((L - 16.5) / L) * 100 && Math.abs(y - 50) <= (40.3 / 2 / H) * 100;

/** Dernière passe réussie d'un coéquipier du buteur dans les secondes qui précèdent un but. */
function avantUnBut(e: any, tous: any[]) {
  if (e.type_action !== 'PASSE' && e.type_action !== 'CENTRE') return false;
  return tous.some((but) => {
    if (but.type_action !== 'BUT') return false;
    const candidates = tous.filter((p) => (p.type_action === 'PASSE' || p.type_action === 'CENTRE') && p.resultat && p.club === but.club
      && p.joueur !== but.joueur && p.temps_video <= but.temps_video && but.temps_video - p.temps_video <= FENETRE_AVANT_BUT);
    return candidates.length > 0 && candidates[candidates.length - 1].id === e.id;
  });
}

const type = (...t: string[]) => (e: any) => t.includes(e.type_action);
const detail = (code: string) => (e: any) => !!e.qualificatifs?.includes(code);
/** Catégories des détails cochés au codage : vides tant que l'analyste ne les a pas saisis. */
const DETAILS: Categorie[] = Object.entries(QUALIFICATIFS).map(([code, q]) => ({
  id: code.toLowerCase(), libelle: q.libelle, aide: 'Détail coché par l\'analyste au codage', filtre: detail(code) }));

export const CATEGORIES: Categorie[] = [
  { id: 'rapport', libelle: 'Rapport vidéo automatique', aide: 'Buts, tirs, dribbles réussis et cartons', filtre: (e) => type('BUT', 'TIR', 'CARTON')(e) || (e.type_action === 'DRIBBLE' && e.resultat) },
  { id: 'meilleures', libelle: 'Meilleures actions', aide: 'Buts, tirs cadrés ou réussis, dribbles réussis', filtre: (e) => type('BUT', 'TIR', 'DRIBBLE')(e) && e.resultat },
  { id: 'buts', libelle: 'Buts', filtre: type('BUT') },
  { id: 'avant-but', libelle: 'Passes avant un but', aide: 'Déduit comme les passes décisives : dernière passe réussie dans les 10 s avant le but', filtre: avantUnBut },
  { id: 'passes', libelle: 'Passes', filtre: type('PASSE') },
  { id: 'progressives', libelle: 'Passes progressives', filtre: progressive },
  { id: 'surface', libelle: 'Passes vers la surface', filtre: (e) => type('PASSE', 'CENTRE')(e) && e.fin_x != null && dansLaSurface(e.fin_x, e.fin_y) },
  { id: 'centres', libelle: 'Centres', filtre: type('CENTRE') },
  { id: 'tirs', libelle: 'Tirs', filtre: type('TIR', 'BUT') },
  { id: 'tetes', libelle: 'Tirs de la tête', filtre: (e) => type('TIR', 'BUT')(e) && e.partie_corps === 'TETE' },
  { id: 'dribbles', libelle: 'Dribbles', filtre: type('DRIBBLE') },
  { id: 'duels', libelle: 'Duels', filtre: type('DUEL') },
  { id: 'interceptions', libelle: 'Interceptions', filtre: type('INTERCEPTION') },
  { id: 'recuperations', libelle: 'Récupérations', filtre: type('RECUPERATION') },
  { id: 'fautes', libelle: 'Fautes', filtre: type('FAUTE') },
  { id: 'hors-jeu', libelle: 'Hors-jeu', filtre: type('HORS_JEU') },
  { id: 'corners', libelle: 'Corners', filtre: type('CORNER') },
  { id: 'arrets', libelle: 'Arrêts du gardien', filtre: type('ARRET') },
  { id: 'cartons', libelle: 'Cartons', filtre: type('CARTON') },
  ...DETAILS,
];
