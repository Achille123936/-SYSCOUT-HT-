import { COLONNES, LIGNES, teinte, type Case } from '../lib/controle';
import { projeter, REFERENCES_M, versImage } from '../lib/homographie';
import type { Point } from './Dessins';
import type { Taille } from './VideoAnnotable';

export interface PointPiste { piste: string; joueur: number | null; club: number | null; temps_video: number; x: number; y: number }
export interface Suivi { piste: string; joueur: number | null; club: number | null; x: number; y: number }

const ECART_MAX = 3; // secondes : au-delà, on n'invente pas de position entre deux points

/** Position de chaque piste à l'instant `t`, interpolée entre les deux points qui l'entourent. `x`, `y` en % du terrain. */
export function pistesALInstant(parPiste: Map<string, PointPiste[]>, t: number): Suivi[] {
  const sortie: Suivi[] = [];
  parPiste.forEach((points) => {
    let i = points.findIndex((p) => p.temps_video >= t);
    if (i === -1) i = points.length;
    const apres = points[i], avant = points[i - 1];
    let x: number, y: number;
    if (avant && apres && apres.temps_video - avant.temps_video <= ECART_MAX) {
      const r = (t - avant.temps_video) / (apres.temps_video - avant.temps_video || 1);
      x = avant.x + (apres.x - avant.x) * r; y = avant.y + (apres.y - avant.y) * r;
    } else {
      const proche = [avant, apres].find((p) => p && Math.abs(p.temps_video - t) <= 0.5);
      if (!proche) return;
      x = proche.x; y = proche.y;
    }
    const ref = avant || apres;
    sortie.push({ piste: ref.piste, joueur: ref.joueur, club: ref.club, x, y });
  });
  return sortie;
}

export function grouperParPiste(points: PointPiste[]) {
  const m = new Map<string, PointPiste[]>();
  [...points].sort((a, b) => a.temps_video - b.temps_video).forEach((p) => { const l = m.get(p.piste); if (l) l.push(p); else m.set(p.piste, [p]); });
  return m;
}

/** Contrôle de l'espace replacé sur l'image : chaque case du terrain devient un quadrilatère en perspective. */
export function CalqueControle({ cases, coins, reference }: { cases: Case[]; coins: Point[]; reference: string }) {
  const h = coins.length === 4 ? versImage(coins, reference) : null;
  if (!h || !cases.length) return null;
  const coin = (i: number, j: number) => projeter(h, (i / COLONNES) * 105, (j / LIGNES) * 68);
  return (
    <g>
      {cases.map(({ i, j, part }) => {
        const q = [coin(i, j), coin(i + 1, j), coin(i + 1, j + 1), coin(i, j + 1)];
        if (q.some((p) => !p || p[0] < -5 || p[0] > 105 || p[1] < -5 || p[1] > 105)) return null;
        return <polygon key={`${i}-${j}`} points={q.map((p) => p!.join(',')).join(' ')} {...teinte(part)} />;
      })}
    </g>
  );
}

/** Couche SVG (en % de l'image) : un anneau sous les pieds, une étiquette, et les liaisons en mètres entre pistes choisies. */
export default function CalqueSuivi({ suivis, coins, reference, taille, liees, etiquette, couleur }: {
  suivis: Suivi[]; coins: Point[]; reference: string; taille: Taille; liees: string[];
  etiquette: (s: Suivi) => string; couleur: (s: Suivi) => string;
}) {
  const h = coins.length === 4 ? versImage(coins, reference) : null;
  if (!h) return null;
  const [L, H] = REFERENCES_M[reference];
  const places = suivis.map((s) => {
    const m: [number, number] = [(s.x / 100) * L, (s.y / 100) * H];
    return { s, m, image: projeter(h, m[0], m[1]) };
  }).filter((p) => p.image && p.image.every((v) => v >= -2 && v <= 102));
  const chaine = liees.map((id) => places.find((p) => p.s.piste === id)).filter((p) => !!p) as typeof places;
  const k = taille.l / taille.h; // rend les ronds et le texte non déformés
  return (
    <g>
      {chaine.slice(1).map((b, i) => {
        const a = chaine[i], [x1, y1] = a.image!, [x2, y2] = b.image!;
        const distance = `${Math.round(Math.hypot(b.m[0] - a.m[0], b.m[1] - a.m[1]))} m`;
        return (
          <g key={`${a.s.piste}-${b.s.piste}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <g transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2}) scale(1 ${k})`}>
              <rect x={-3} y={-1.4} width={6} height={2.8} rx={1.4} fill="#fff" /><text y={0.6} fontSize={1.7} fontWeight="bold" textAnchor="middle" fill="#111">{distance}</text>
            </g>
          </g>
        );
      })}
      {places.map(({ s, image }) => {
        const [x, y] = image!, nom = etiquette(s), largeur = nom.length * 0.95 + 1.6;
        return (
          <g key={s.piste} transform={`translate(${x} ${y}) scale(1 ${k})`}>
            <ellipse rx={1.7} ry={0.7} fill={couleur(s)} fillOpacity={0.25} stroke={couleur(s)} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <g transform="translate(0 -6.4)">
              <rect x={-largeur / 2} y={-1.3} width={largeur} height={2.4} rx={0.4} fill="#0b1220" fillOpacity={0.85} stroke={couleur(s)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text y={0.5} fontSize={1.5} fontWeight="bold" textAnchor="middle" fill="#fff">{nom}</text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
