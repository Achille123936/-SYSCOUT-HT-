import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { entreesPour, type Entree } from '../lib/menu';
import Pied from './Pied';
import { Chargement } from './ui';

const GROUPES: Entree['groupe'][] = ['Analyse', 'Scouting', 'Gestion', 'Administration'];

// Espace connecté : barre utilitaire, antèt collant avec menus déroulants par rubrique (droits par rôle), contenu, pied de page.
export default function Layout() {
  const { utilisateur, pret, deconnexion } = useAuth();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [defile, setDefile] = useState(false);
  const barre = useRef<HTMLDivElement>(null);
  const lieu = useLocation();

  useEffect(() => { setOuvert(null); setMobile(false); }, [lieu.pathname]);
  useEffect(() => {
    const f = () => setDefile(window.scrollY > 24);
    const dehors = (e: MouseEvent) => { if (barre.current && !barre.current.contains(e.target as Node)) setOuvert(null); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(null); };
    window.addEventListener('scroll', f, { passive: true }); document.addEventListener('mousedown', dehors); document.addEventListener('keydown', echap);
    return () => { window.removeEventListener('scroll', f); document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
  }, []);

  if (!pret) return <div className="p-10"><Chargement /></div>;
  if (!utilisateur) return <Navigate to="/connexion" replace state={{ de: lieu.pathname }} />;

  const entrees = entreesPour(utilisateur.role);
  const accueil = entrees.find((e) => e.chemin === '/app');
  const parGroupe = GROUPES.map((g) => ({ nom: g, liens: entrees.filter((e) => e.groupe === g && e.chemin !== '/app') })).filter((g) => g.liens.length);
  const actif = (g: { liens: Entree[] }) => g.liens.some((e) => lieu.pathname === e.chemin || lieu.pathname.startsWith(e.chemin + '/'));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="bg-navy text-xs text-white/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 lg:px-8">
          <Link to="/" className="hover:text-white">‹ Site public</Link>
          <span className="flex items-center gap-4">
            <span className="hidden sm:inline">{utilisateur.prenom} {utilisateur.nom} · {utilisateur.role_libelle}</span>
            <Link to="/app/compte" className="hover:text-white">Mon compte</Link>
            <button onClick={deconnexion} className="hover:text-white">Déconnexion</button>
          </span>
        </div>
      </div>

      <header ref={barre} className={`sticky top-0 z-40 bg-white transition ${defile ? 'shadow-md' : 'border-b border-slate-200'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link to="/app" className="flex items-center gap-2.5" aria-label="SYSCOUT-HT, tableau de bord">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy text-base font-black text-brand-green">S</span>
            <span className="text-xl font-extrabold tracking-tight text-navy">SYSCOUT<span className="text-brand-green">-HT</span></span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Menu principal">
            {accueil ? <NavLink to="/app" end className={({ isActive }) => `rounded-lg px-3.5 py-2 text-sm font-semibold ${isActive ? 'bg-slate-100 text-navy' : 'text-slate-600 hover:bg-slate-50 hover:text-navy'}`}>Tableau de bord</NavLink> : null}
            {parGroupe.map((g) => (
              <div key={g.nom} className="relative">
                <button onClick={() => setOuvert(ouvert === g.nom ? null : g.nom)} aria-expanded={ouvert === g.nom} aria-haspopup="true"
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold ${actif(g) ? 'bg-slate-100 text-navy' : 'text-slate-600 hover:bg-slate-50 hover:text-navy'}`}>
                  {g.nom}<span className={`text-[10px] transition ${ouvert === g.nom ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
                </button>
                {ouvert === g.nom ? (
                  <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-2xl" role="menu">
                    <div className="h-0.5 bg-gradient-to-r from-[#00209F] to-[#D21034]" aria-hidden="true" />
                    {g.liens.map((e) => (
                      <NavLink key={e.chemin} to={e.chemin} role="menuitem" className={({ isActive }) => `block px-4 py-2.5 text-sm ${isActive ? 'bg-blue-50 font-semibold text-brand-blue' : 'text-slate-700 hover:bg-slate-50'}`}>{e.libelle}</NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>

          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:hidden" onClick={() => setMobile(!mobile)} aria-expanded={mobile} aria-label="Menu">☰ Menu</button>
        </div>
        {mobile ? (
          <nav className="max-h-[70vh] overflow-y-auto border-t border-slate-100 bg-white px-4 py-3 lg:hidden" aria-label="Menu mobile">
            {accueil ? <NavLink to="/app" end className="block py-2.5 text-sm font-semibold text-navy">Tableau de bord</NavLink> : null}
            {parGroupe.map((g) => (
              <div key={g.nom} className="mt-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.nom}</p>
                {g.liens.map((e) => <NavLink key={e.chemin} to={e.chemin} className={({ isActive }) => `block py-2 text-sm ${isActive ? 'font-semibold text-brand-blue' : 'text-slate-700'}`}>{e.libelle}</NavLink>)}
              </div>
            ))}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-8"><Outlet /></main>
      <Pied />
    </div>
  );
}
