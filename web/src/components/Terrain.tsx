import type { ReactNode } from 'react';

// Terrain de 105 × 68 m ; l'équipe attaque vers la droite. `children` se dessine sous les lignes.
export const L = 105, H = 68;
const TRAIT = { stroke: '#94a3b8', strokeWidth: 0.4, fill: 'none' } as const;

export function Terrain({ children, derriere }: { children?: ReactNode; derriere?: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${L} ${H}`} className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50" role="img" aria-label="Terrain">
      {derriere}
      <rect x={0.5} y={0.5} width={L - 1} height={H - 1} {...TRAIT} />
      <line x1={L / 2} y1={0.5} x2={L / 2} y2={H - 0.5} {...TRAIT} />
      <circle cx={L / 2} cy={H / 2} r={9.15} {...TRAIT} />
      <rect x={0.5} y={(H - 40.3) / 2} width={16.5} height={40.3} {...TRAIT} />
      <rect x={L - 17} y={(H - 40.3) / 2} width={16.5} height={40.3} {...TRAIT} />
      <rect x={0.5} y={(H - 18.3) / 2} width={5.5} height={18.3} {...TRAIT} />
      <rect x={L - 6} y={(H - 18.3) / 2} width={5.5} height={18.3} {...TRAIT} />
      {children}
    </svg>
  );
}

/** Zones d'activité : une case est d'autant plus foncée que le joueur y est actif. `grille[ligne][colonne]`. */
export function Chaleur({ grille, maximum, couleur = '#2475D2' }: { grille: number[][]; maximum: number; couleur?: string }) {
  const lignes = grille.length, colonnes = grille[0]?.length || 1;
  return (
    <>
      {grille.flatMap((rang, r) => rang.map((n, c) => (n ? (
        <rect key={`${r}-${c}`} x={c * (L / colonnes)} y={r * (H / lignes)} width={L / colonnes} height={H / lignes}
          fill={couleur} fillOpacity={0.1 + 0.75 * (n / Math.max(1, maximum))} />
      ) : null)))}
    </>
  );
}

/** Construit une grille 12 × 8 à partir d'actions [{ zone_x, zone_y }] en pourcentage du terrain. */
export function grilleDesActions(actions: { zone_x: number; zone_y: number }[], colonnes = 12, lignes = 8) {
  const g = Array.from({ length: lignes }, () => Array(colonnes).fill(0) as number[]);
  actions.forEach((a) => {
    const c = Math.min(colonnes - 1, Math.floor((a.zone_x / 100) * colonnes));
    const r = Math.min(lignes - 1, Math.floor((a.zone_y / 100) * lignes));
    g[r][c] += 1;
  });
  return { grille: g, maximum: Math.max(1, ...g.flat()) };
}
