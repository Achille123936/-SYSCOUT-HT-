// Radar des centiles (CU09) : rang parmi les joueurs du même poste (RG5), de 0 à 100.
export interface Serie { nom: string; couleur: string; centiles?: Record<string, number> | null }

const AXES: [string, string][] = [
  ['buts_p90', 'Buts'], ['xg_p90', 'xG'], ['tirs_p90', 'Tirs'], ['passes_p90', 'Passes'],
  ['passes_reussies_pct', 'Passes %'], ['dribbles_p90', 'Dribbles'], ['duels_gagnes_pct', 'Duels %'],
  ['recuperations_p90', 'Récup.'], ['interceptions_p90', 'Intercept.'],
];

export default function Radar({ series }: { series: Serie[] }) {
  const traces = series.filter((s) => s.centiles && Object.keys(s.centiles).length);
  const T = 160, R = 110, n = AXES.length;
  const point = (i: number, v: number): [number, number] => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [T + Math.cos(a) * R * (v / 100), T + Math.sin(a) * R * (v / 100)];
  };
  if (!traces.length) return <p className="py-8 text-center text-sm text-slate-500">Pas de centiles : moins de 450 minutes jouées (RG5).</p>;
  return (
    <div>
      <svg viewBox={`0 0 ${T * 2} ${T * 2}`} className="mx-auto w-full max-w-sm" role="img" aria-label="Radar des centiles">
        {[25, 50, 75, 100].map((g) => (
          <polygon key={g} points={AXES.map((_, i) => point(i, g).join(',')).join(' ')} fill="none" stroke="#e2e8f0" />
        ))}
        {AXES.map(([, nom], i) => {
          const [x, y] = point(i, 100); const [lx, ly] = point(i, 118);
          return (
            <g key={nom}>
              <line x1={T} y1={T} x2={x} y2={y} stroke="#e2e8f0" />
              <text x={lx} y={ly} fontSize="9.5" textAnchor="middle" dominantBaseline="middle" fill="#64748b">{nom}</text>
            </g>
          );
        })}
        {traces.map((s) => (
          <polygon key={s.nom} fill={s.couleur} fillOpacity={0.15} stroke={s.couleur} strokeWidth={2}
            points={AXES.map(([cle], i) => point(i, Math.max(0, Math.min(100, s.centiles?.[cle] ?? 0))).join(',')).join(' ')} />
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-slate-600">
        {traces.map((s) => <li key={s.nom} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.couleur }} />{s.nom}</li>)}
      </ul>
    </div>
  );
}
