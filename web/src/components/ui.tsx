import { Link, useLocation } from 'react-router-dom';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { MENU } from '../lib/menu';
import type { Ton } from '../lib/format';

const TONS: Record<Ton, string> = {
  gris: 'bg-slate-100 text-slate-700', vert: 'bg-emerald-50 text-emerald-700', bleu: 'bg-blue-50 text-blue-700',
  orange: 'bg-amber-50 text-amber-700', rouge: 'bg-red-50 text-red-700',
};

export const Badge = ({ children, ton = 'gris' }: { children: ReactNode; ton?: Ton }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONS[ton]}`}>{children}</span>
);

export const Card = ({ titre, droite, children, className = '' }: { titre?: ReactNode; droite?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
    {titre || droite ? (
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-navy">{titre}</h2>{droite}
      </div>
    ) : null}
    {children}
  </section>
);

type Genre = 'primaire' | 'secondaire' | 'succes' | 'danger';
const GENRES: Record<Genre, string> = {
  primaire: 'bg-brand-blue text-white hover:bg-blue-700',
  secondaire: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  succes: 'bg-brand-green text-white hover:bg-emerald-600',
  danger: 'bg-brand-red text-white hover:bg-red-600',
};
export const Bouton = ({ genre = 'primaire', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { genre?: Genre }) => (
  <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${GENRES[genre]} ${className}`} />
);

export const Alerte = ({ ton = 'orange', children }: { ton?: 'orange' | 'rouge' | 'bleu' | 'vert'; children: ReactNode }) => {
  if (!children) return null;
  const c = { orange: 'border-amber-200 bg-amber-50 text-amber-900', rouge: 'border-red-200 bg-red-50 text-red-900', bleu: 'border-blue-200 bg-blue-50 text-blue-900', vert: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[ton];
  return <div role="alert" className={`whitespace-pre-line rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
};

const champ = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-blue-100';
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

/** Ban de titre de page : fil d'Ariane, titre, sous-titre et actions, sur fond navy avec le liseré aux couleurs d'Haïti. */
export function Titre({ titre, sous, droite }: { titre: string; sous?: ReactNode; droite?: ReactNode }) {
  const { pathname } = useLocation();
  const entree = [...MENU].sort((x, y) => y.chemin.length - x.chemin.length).find((e) => pathname === e.chemin || pathname.startsWith(e.chemin + '/'));
  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-navy to-navy-600 text-white shadow-lg">
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-7 pt-5 md:px-8">
        <div className="min-w-0">
          <nav aria-label="Fil d'Ariane" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
            <Link to="/app" className="hover:text-white">Accueil</Link>
            {entree && entree.chemin !== '/app' ? <><span aria-hidden="true">›</span><Link to={entree.chemin} className="hover:text-white">{entree.libelle}</Link></> : null}
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{titre}</h1>
          {sous ? <p className="mt-1.5 max-w-3xl text-sm text-white/70 [&_a]:text-blue-200 [&_a:hover]:underline">{sous}</p> : null}
        </div>
        {droite ? <div className="flex flex-wrap items-center gap-2">{droite}</div> : null}
      </div>
      <div className="h-1 bg-gradient-to-r from-[#00209F] via-[#00209F] to-[#D21034]" aria-hidden="true" />
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
