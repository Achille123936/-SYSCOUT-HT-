import { Link, useLocation } from 'react-router-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { MENU } from '../lib/menu';
import type { Ton } from '../lib/format';

const TONS: Record<Ton, string> = {
  gris: 'bg-slate-100 text-slate-700', vert: 'bg-emerald-50 text-emerald-700', bleu: 'bg-blue-50 text-blue-700',
  orange: 'bg-amber-50 text-amber-700', rouge: 'bg-red-50 text-red-700',
};

export const Badge = ({ children, ton = 'gris' }: { children: ReactNode; ton?: Ton }) => (
  <span className={`inline-flex items-center rounded-[3px] px-2 py-0.5 text-[11px] font-bold ${TONS[ton]}`}>{children}</span>
);

export const Card = ({ titre, droite, children, className = '' }: { titre?: ReactNode; droite?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`border border-wy-bord bg-white p-4 ${className}`}>
    {titre || droite ? (
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-wy-texte">{titre}</h2>{droite}
      </div>
    ) : null}
    {children}
  </section>
);

type Genre = 'primaire' | 'secondaire' | 'succes' | 'danger';
const GENRES: Record<Genre, string> = {
  primaire: 'bg-wy-azur text-white hover:bg-wy-bleu',
  secondaire: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  succes: 'bg-brand-green text-white hover:bg-emerald-600',
  danger: 'bg-brand-red text-white hover:bg-red-600',
};
export const Bouton = ({ genre = 'primaire', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { genre?: Genre }) => (
  <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-[3px] px-3 py-1.5 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${GENRES[genre]} ${className}`} />
);

export const Alerte = ({ ton = 'orange', children }: { ton?: 'orange' | 'rouge' | 'bleu' | 'vert'; children: ReactNode }) => {
  if (!children) return null;
  const c = { orange: 'border-amber-200 bg-amber-50 text-amber-900', rouge: 'border-red-200 bg-red-50 text-red-900', bleu: 'border-blue-200 bg-blue-50 text-blue-900', vert: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[ton];
  return <div role="alert" className={`whitespace-pre-line rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
};

const champ = 'w-full rounded-[3px] border border-wy-bord bg-white px-3 py-1.5 text-[13px] outline-none focus:border-wy-azur focus:ring-1 focus:ring-wy-azur';
export const Champ = ({ libelle, erreur, ...p }: InputHTMLAttributes<HTMLInputElement> & { libelle?: string; erreur?: string }) => (
  <label className="block text-sm">
    {libelle ? <span className="mb-1 block font-medium text-slate-700">{libelle}</span> : null}
    <input {...p} className={`${champ} ${p.className || ''}`} />
    {erreur ? <span className="mt-1 block text-xs text-brand-red">{erreur}</span> : null}
  </label>
);
export const Choix = ({ libelle, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { libelle?: string }) => (
  <label className="block text-sm">
    {libelle ? <span className="mb-1 block font-medium text-slate-700">{libelle}</span> : null}
    <select {...p} className={champ}>{children}</select>
  </label>
);

export const Chargement = () => (
  <div className="flex items-center gap-3 py-6 text-sm text-slate-500" role="status">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-blue" /> Chargement…
  </div>
);

/** Affiche le chargement ou l'erreur d'un `useChargement` ; `children` n'est montré que quand les données sont là. */
export function Etat({ enCours, erreur, donnees, recharger, children }: { enCours: boolean; erreur: string | null; donnees: unknown; recharger?: () => void; children: ReactNode }) {
  if (erreur && !donnees) return (
    <div className="space-y-3"><Alerte ton="rouge">{erreur}</Alerte>{recharger ? <Bouton genre="secondaire" onClick={recharger}>Réessayer</Bouton> : null}</div>
  );
  if (enCours && !donnees) return <Chargement />;
  return <>{children}</>;
}

/** Barre de titre de page (style « Scout ») : fil d'Ariane, titre en majuscules, sous-titre et actions, filet azur. */
export function Titre({ titre, sous, droite }: { titre: string; sous?: ReactNode; droite?: ReactNode }) {
  const { pathname } = useLocation();
  const entree = [...MENU].sort((x, y) => y.chemin.length - x.chemin.length).find((e) => pathname === e.chemin || pathname.startsWith(e.chemin + '/'));
  return (
    <div className="mb-4 border border-b-2 border-wy-bord border-b-wy-azur bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <nav aria-label="Fil d'Ariane" className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-wy-doux">
            <Link to="/app" className="hover:text-wy-bleu">Accueil</Link>
            {entree && entree.chemin !== '/app' ? <><span aria-hidden="true">›</span><Link to={entree.chemin} className="hover:text-wy-bleu">{entree.libelle}</Link></> : null}
          </nav>
          <h1 className="text-[16px] font-bold uppercase text-wy-texte">{titre}</h1>
          {sous ? <p className="mt-0.5 max-w-3xl text-[12px] text-wy-doux [&_a]:text-wy-bleu [&_a:hover]:underline">{sous}</p> : null}
        </div>
        {droite ? <div className="flex flex-wrap items-center gap-2">{droite}</div> : null}
      </div>
    </div>
  );
}

export const Pagination = ({ page, total, taille, onChange }: { page: number; total: number; taille: number; onChange: (p: number) => void }) => {
  const pages = Math.max(1, Math.ceil(total / taille));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>{total} résultat(s)</span>
      <div className="flex items-center gap-2">
        <Bouton genre="secondaire" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Précédent</Bouton>
        <span>Page {page} / {pages}</span>
        <Bouton genre="secondaire" disabled={page >= pages} onClick={() => onChange(page + 1)}>Suivant ›</Bouton>
      </div>
    </div>
  );
};

export const Vide = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
