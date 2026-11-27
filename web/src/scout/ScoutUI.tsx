import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Panneau à titre en majuscules (style « fiche » : fond blanc, filet gris, titre sombre). */
export const Panneau = ({ titre, droite, children, className = '' }: { titre?: ReactNode; droite?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`border border-wy-bord bg-white ${className}`}>
    {titre || droite ? (
      <header className="flex items-center justify-between gap-3 px-4 pt-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-wy-texte">{titre}</h2>{droite}
      </header>
    ) : null}
    <div className="p-4">{children}</div>
  </section>
);

/** Étiquette (bleue) et valeur d'une ligne d'information. */
export const Info = ({ libelle, children, orange = false }: { libelle: string; children: ReactNode; orange?: boolean }) => (
  <div className="flex gap-3 py-[3px] text-[13px]">
    <dt className={`w-32 shrink-0 font-bold ${orange ? 'text-wy-orange' : 'text-wy-bleu'}`}>{libelle}</dt>
    <dd className="text-wy-texte">{children}</dd>
  </div>
);

/** Onglets de la page : l'onglet actif est plein azur, les autres sont des cases à bord gris. */
export function Onglets({ onglets, actif }: { onglets: { id: string; libelle: string; vers: string }[]; actif: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-wy-azur px-4" aria-label="Onglets">
      {onglets.map((o) => (
        <Link key={o.id} to={o.vers} aria-current={o.id === actif ? 'page' : undefined}
          className={`border border-b-0 px-5 py-1.5 text-[13px] ${o.id === actif ? 'border-wy-azur bg-[#323400] font-semibold text-[#F5D90A]' : 'border-wy-bord bg-white text-wy-texte hover:bg-slate-50'}`}>{o.libelle}</Link>
      ))}
    </nav>
  );
}

/** Carré azur avec un triangle blanc : lancer une vidéo. */
export const Lecture = ({ taille = 28 }: { taille?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-[3px] bg-wy-azur" style={{ width: taille, height: taille }} aria-hidden="true">
    <svg viewBox="0 0 10 10" width={taille * 0.36} height={taille * 0.36}><path d="M2 1 L9 5 L2 9 z" fill="#fff" /></svg>
  </span>
);

/** Petit carré azur numéroté (liste de moments forts). */
export const Numero = ({ n }: { n: number }) => (
  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[3px] bg-wy-azur text-[12px] font-bold text-white">{n}</span>
);

/** Bouton plein azur. */
export const BoutonAzur = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={`inline-flex items-center gap-1.5 rounded-[3px] bg-wy-azur px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-wy-bleu disabled:opacity-50 ${p.className || ''}`}>{children}</button>
);

/** Mini terrain vert à lignes blanches ; les points sont en % (x : 100 = but adverse). */
export function TerrainVert({ points = [], moyenne }: { points?: { x: number; y: number }[]; moyenne?: { x: number; y: number } | null }) {
  const L = 105, H = 68, t = { stroke: '#fff', strokeWidth: 0.35, fill: 'none' } as const;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" aria-label="Terrain">
      <rect width={L} height={H} fill="#6AB04C" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={(L / 8) * i} width={L / 8} height={H} fill={i % 2 ? '#64A946' : '#6AB04C'} />)}
      <rect x={0.5} y={0.5} width={L - 1} height={H - 1} {...t} /><line x1={L / 2} y1={0.5} x2={L / 2} y2={H - 0.5} {...t} />
      <circle cx={L / 2} cy={H / 2} r={9.15} {...t} /><circle cx={L / 2} cy={H / 2} r={0.5} fill="#fff" />
      <rect x={0.5} y={(H - 40.3) / 2} width={16.5} height={40.3} {...t} /><rect x={L - 17} y={(H - 40.3) / 2} width={16.5} height={40.3} {...t} />
      <rect x={0.5} y={(H - 18.3) / 2} width={5.5} height={18.3} {...t} /><rect x={L - 6} y={(H - 18.3) / 2} width={5.5} height={18.3} {...t} />
      {points.slice(0, 400).map((p, i) => <circle key={i} cx={(p.x / 100) * L} cy={(p.y / 100) * H} r={0.9} fill="#00AAFF" fillOpacity={0.55} />)}
      {moyenne ? <circle cx={(moyenne.x / 100) * L} cy={(moyenne.y / 100) * H} r={2.6} fill="#fff" stroke="#00AAFF" strokeWidth={0.8} /> : null}
    </svg>
  );
}

export interface Part { nom: string; valeur: number; couleur: string }

/** Disque en secteurs avec anneau extérieur et pourcentages en étiquettes. */
export function Disque({ parts }: { parts: Part[] }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  if (!total) return <p className="py-10 text-center text-[13px] text-wy-doux">Pas encore d'action codée.</p>;
  const R = 70, CX = 170, CY = 130;
  let angle = -Math.PI / 2;
  const segments = parts.filter((p) => p.valeur > 0).map((p) => {
    const part = p.valeur / total, a0 = angle, a1 = angle + part * Math.PI * 2;
    angle = a1;
    const pt = (a: number, r: number) => `${CX + Math.cos(a) * r},${CY + Math.sin(a) * r}`;
    const mid = (a0 + a1) / 2;
    return { ...p, part, d: part === 1 ? '' : `M${CX},${CY} L${pt(a0, R)} A${R},${R} 0 ${part > 0.5 ? 1 : 0} 1 ${pt(a1, R)} Z`,
      lx: CX + Math.cos(mid) * (R + 16), ly: CY + Math.sin(mid) * (R + 16) + 3, ancre: Math.cos(mid) >= 0 ? 'start' : 'end' };
  });
  return (
    <svg viewBox="0 0 340 260" className="mx-auto w-full max-w-[360px]" role="img" aria-label="Répartition des actions">
      <circle cx={CX} cy={CY} r={R + 7} fill="none" stroke="#7EC4EE" strokeWidth={4} />
      {segments.map((s) => s.part === 1 ? <circle key={s.nom} cx={CX} cy={CY} r={R} fill={s.couleur} /> : <path key={s.nom} d={s.d} fill={s.couleur} stroke="#fff" strokeWidth={1} />)}
      {segments.map((s) => <text key={s.nom} x={s.lx} y={s.ly} fontSize="10" fontWeight="bold" textAnchor={s.ancre as 'start' | 'end'} style={{ fill: 'var(--wy-texte)' }}>{s.nom.toUpperCase()} {Math.round(s.part * 100)}%</text>)}
    </svg>
  );
}
