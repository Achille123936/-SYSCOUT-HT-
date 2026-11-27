import type { Taille } from './VideoAnnotable';

export type Forme = 'FLECHE' | 'LIGNE' | 'CERCLE' | 'OVALE' | 'ZONE' | 'SPOT' | 'MESURE' | 'COURBE' | 'TEXTE' | 'JOUEUR' | 'TRAIT' | 'CHAINE' | 'POLY' | 'BANDE';
export type Point = [number, number];
export interface Dessin { id?: number; forme: Forme; couleur: string; points: Point[]; texte?: string; mesures?: number[]; temps_video?: number; duree?: number; auteur_nom?: string }

// [libellé, nombre de points (minimum, maximum), mesurée en mètres si le terrain est calibré]
export const FORMES: Record<Forme, [string, [number, number], boolean]> = {
  FLECHE: ['Flèche', [2, 2], false], LIGNE: ['Ligne', [2, 2], false], COURBE: ['Courbe', [3, 3], false], CERCLE: ['Cercle', [2, 2], false],
  OVALE: ['Ovale', [2, 2], false], ZONE: ['Zone', [2, 2], false], SPOT: ['Projecteur', [2, 2], false], MESURE: ['Distance', [2, 2], true],
  CHAINE: ['Liaisons', [2, 12], true], POLY: ['Triangle / polygone', [3, 12], true], TRAIT: ['Trait libre', [2, 400], false],
  TEXTE: ['Texte', [1, 1], false], JOUEUR: ['Étiquette joueur', [1, 1], false], BANDE: ['Flèche à chevrons', [2, 2], false],
};

const milieu = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function Etiquette({ x, y, texte, couleur }: { x: number; y: number; texte: string; couleur: string }) {
  const l = texte.length * 1.35 + 2;
  return (<g><rect x={x - l / 2} y={y - 2.2} width={l} height={4.4} rx={1} fill="#0b1f4d" fillOpacity={0.85} stroke={couleur} strokeWidth={0.2} />
    <text x={x} y={y + 0.9} fontSize={2.6} fill="#fff" textAnchor="middle" fontWeight="bold">{texte}</text></g>);
}

/** Dessine une annotation de télestration. Les points sont en % de l'image ; `taille` (pixels affichés) sert à garder des cercles ronds. */
export default function DessinSvg({ d, taille, provisoire = false }: { d: Dessin; taille: Taille; provisoire?: boolean }) {
  const p = d.points;
  const c = d.couleur;
  const base = { stroke: c, strokeWidth: 0.6, fill: 'none', vectorEffect: 'non-scaling-stroke' as const, opacity: provisoire ? 0.7 : 1 };
  const trait = { ...base, strokeWidth: 3 };
  if (!p.length) return null;
  if (d.forme === 'BANDE') {
    if (p.length < 2) return <circle cx={p[0][0]} cy={p[0][1]} r={0.8} fill={c} />;
    // chevrons réguliers entre les deux points, calculés en pixels pour ne pas être déformés
    const [ax, ay, bx, by] = [(p[0][0] / 100) * taille.l, (p[0][1] / 100) * taille.h, (p[1][0] / 100) * taille.l, (p[1][1] / 100) * taille.h];
    const long = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / long, uy = (by - ay) / long, t = 11;
    const pc = (x: number, y: number) => `${(x / taille.l) * 100},${(y / taille.h) * 100}`;
    return (
      <g opacity={provisoire ? 0.7 : 1}>
        {Array.from({ length: Math.max(1, Math.floor(long / (t * 1.6))) }, (_, i) => {
          const x = ax + ux * (i * t * 1.6 + t), y = ay + uy * (i * t * 1.6 + t);
          return <polyline key={i} points={`${pc(x - ux * t - uy * t, y - uy * t + ux * t)} ${pc(x, y)} ${pc(x - ux * t + uy * t, y - uy * t - ux * t)}`}
            fill="none" stroke={c} strokeWidth={5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
        })}
      </g>
    );
  }
  const rayon = (a: Point, b: Point): [number, number] => {
    const r = Math.hypot(((b[0] - a[0]) * taille.l) / 100, ((b[1] - a[1]) * taille.h) / 100);
    return [(r * 100) / taille.l, (r * 100) / taille.h];
  };
  const segments = (pts: Point[], ferme: boolean) => pts.map((a, i) => [a, pts[(i + 1) % pts.length]] as [Point, Point]).slice(0, ferme ? pts.length : pts.length - 1);
  const mesures = (pts: Point[], ferme: boolean) => d.mesures?.length ? segments(pts, ferme).map(([a, b], i) => {
    const [x, y] = milieu(a, b);
    return d.mesures![i] !== undefined ? <Etiquette key={i} x={x} y={y} texte={`${String(d.mesures![i]).replace('.', ',')} m`} couleur={c} /> : null;
  }) : null;
  const liste = p.map((q) => q.join(',')).join(' ');

  switch (d.forme) {
    case 'FLECHE': return <line x1={p[0][0]} y1={p[0][1]} x2={p[1]?.[0] ?? p[0][0]} y2={p[1]?.[1] ?? p[0][1]} {...trait} markerEnd="url(#pointe)" />;
    case 'LIGNE': return <line x1={p[0][0]} y1={p[0][1]} x2={p[1]?.[0] ?? p[0][0]} y2={p[1]?.[1] ?? p[0][1]} {...trait} />;
    case 'COURBE': return p.length === 3 ? <path d={`M${p[0]} Q${p[1]} ${p[2]}`} {...trait} markerEnd="url(#pointe)" /> : <polyline points={liste} {...trait} />;
    case 'CERCLE': { const [rx, ry] = p[1] ? rayon(p[0], p[1]) : [0, 0]; return <ellipse cx={p[0][0]} cy={p[0][1]} rx={rx} ry={ry} {...trait} />; }
    case 'SPOT': { const [rx, ry] = p[1] ? rayon(p[0], p[1]) : [0, 0]; return <ellipse cx={p[0][0]} cy={p[0][1]} rx={rx} ry={ry} fill={c} fillOpacity={0.3} stroke={c} strokeWidth={2} vectorEffect="non-scaling-stroke" />; }
    case 'OVALE': { const m = p[1] ? milieu(p[0], p[1]) : p[0]; return <ellipse cx={m[0]} cy={m[1]} rx={p[1] ? Math.abs(p[1][0] - p[0][0]) / 2 : 0} ry={p[1] ? Math.abs(p[1][1] - p[0][1]) / 2 : 0} {...trait} />; }
    case 'ZONE': return p[1] ? <rect x={Math.min(p[0][0], p[1][0])} y={Math.min(p[0][1], p[1][1])} width={Math.abs(p[1][0] - p[0][0])} height={Math.abs(p[1][1] - p[0][1])} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null;
    case 'MESURE': return <g><line x1={p[0][0]} y1={p[0][1]} x2={p[1]?.[0] ?? p[0][0]} y2={p[1]?.[1] ?? p[0][1]} {...trait} />{p[1] ? mesures(p, false) : null}</g>;
    case 'CHAINE': return <g><polyline points={liste} {...trait} />{p.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={0.8} fill={c} />)}{mesures(p, false)}</g>;
    case 'POLY': return <g><polygon points={liste} fill={c} fillOpacity={0.2} stroke={c} strokeWidth={2} vectorEffect="non-scaling-stroke" />{p.length >= 3 ? mesures(p, true) : null}</g>;
    case 'TRAIT': return <polyline points={liste} {...trait} strokeLinecap="round" strokeLinejoin="round" />;
    case 'TEXTE': return <text x={p[0][0]} y={p[0][1]} fontSize={4} fill={c} fontWeight="bold" stroke="#000" strokeWidth={0.15}>{d.texte}</text>;
    case 'JOUEUR': return <g><circle cx={p[0][0]} cy={p[0][1]} r={1.4} fill={c} stroke="#fff" strokeWidth={0.3} />
      <Etiquette x={p[0][0]} y={p[0][1] - 4} texte={`${d.texte || ''}${d.mesures?.[0] !== undefined ? ` · ${String(d.mesures[0]).replace('.', ',')} km/h` : ''}`} couleur={c} /></g>;
    default: return null;
  }
}
