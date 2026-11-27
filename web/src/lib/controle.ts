// Contrôle de l'espace : pour chaque case du terrain, quelle équipe a les joueurs les plus proches.
// Modèle volontairement simple (distance seule, sans vitesse ni direction, sans ballon) : c'est une indication.

export interface Present { x: number; y: number; domicile: boolean } // x, y en % du terrain
export interface Case { i: number; j: number; part: number }          // part de l'équipe à domicile, de 0 à 1

export const COLONNES = 35, LIGNES = 23;
const L = 105, H = 68, PORTEE = 7; // mètres : l'influence d'un joueur décroît vite au-delà

export function controle(presents: Present[]): Case[] {
  if (!presents.some((p) => p.domicile) || !presents.some((p) => !p.domicile)) return []; // il faut les deux équipes
  const cases: Case[] = [];
  for (let j = 0; j < LIGNES; j += 1) {
    for (let i = 0; i < COLONNES; i += 1) {
      const cx = ((i + 0.5) / COLONNES) * L, cy = ((j + 0.5) / LIGNES) * H;
      const d2 = presents.map((p) => (cx - (p.x / 100) * L) ** 2 + (cy - (p.y / 100) * H) ** 2);
      const mini = Math.min(...d2); // référence commune : loin de tous, la plus proche équipe l'emporte encore
      let dom = 0, tout = 0;
      presents.forEach((p, k) => { const v = Math.exp(-(d2[k] - mini) / (2 * PORTEE ** 2)); tout += v; if (p.domicile) dom += v; });
      cases.push({ i, j, part: dom / tout });
    }
  }
  return cases;
}

export const COULEUR_DOMICILE = '#ff4d4f', COULEUR_EXTERIEUR = '#2475D2';
export const teinte = (part: number) => ({ fill: part >= 0.5 ? COULEUR_DOMICILE : COULEUR_EXTERIEUR, fillOpacity: 0.08 + 0.5 * Math.abs(part - 0.5) * 2 });
