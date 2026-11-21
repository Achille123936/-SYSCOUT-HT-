import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { entreesPour } from '../lib/menu';
import { Chargement } from './ui';

// Espace connecté : menu latéral selon le rôle (RBAC), barre du haut, contenu de la page.
export default function Layout() {
  const { utilisateur, pret, deconnexion } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const lieu = useLocation();
  if (!pret) return <div className="p-10"><Chargement /></div>;
  if (!utilisateur) return <Navigate to="/connexion" replace state={{ de: lieu.pathname }} />;

  const entrees = entreesPour(utilisateur.role);
  const groupes = [...new Set(entrees.map((e) => e.groupe))];
  const menu = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Menu principal">
      {groupes.map((g) => (
        <div key={g}>
          <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">{g}</p>
          {entrees.filter((e) => e.groupe === g).map((e) => (
            <NavLink key={e.chemin} to={e.chemin} end={e.chemin === '/app'} onClick={() => setOuvert(false)}
              className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
              {e.libelle}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-navy lg:flex">
        <div className="px-6 py-5 text-lg font-extrabold text-white">SYSCOUT<span className="text-brand-green">-HT</span></div>
        {menu}
      </aside>
      {ouvert ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="flex w-64 flex-col bg-navy">{menu}</div>
          <button aria-label="Fermer le menu" className="flex-1 bg-black/40" onClick={() => setOuvert(false)} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm lg:hidden" onClick={() => setOuvert(true)} aria-label="Ouvrir le menu">☰ Menu</button>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-right"><span className="block font-semibold text-navy">{utilisateur.prenom} {utilisateur.nom}</span><span className="block text-xs text-slate-500">{utilisateur.role_libelle}</span></span>
            <button onClick={deconnexion} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Déconnexion</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}
