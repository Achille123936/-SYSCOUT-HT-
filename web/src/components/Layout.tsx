import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { entreesPour, type Entree } from '../lib/menu';
import Pied from './Pied';
import { Chargement } from './ui';

const GROUPES: Entree['groupe'][] = ['Analyse', 'Scouting', 'Gestion', 'Administration'];

// Espace connecté, même style que l'interface « Scout » : barre blanche, menu latéral par rubrique (droits par rôle),
// contenu dense, pied de page.
export default function Layout() {
  const { utilisateur, pret, deconnexion } = useAuth();
  const [mobile, setMobile] = useState(false);
  const lieu = useLocation();

  useEffect(() => { setMobile(false); }, [lieu.pathname]);

  if (!pret) return <div className="p-10"><Chargement /></div>;
  if (!utilisateur) return <Navigate to="/connexion" replace state={{ de: lieu.pathname }} />;

  const entrees = entreesPour(utilisateur.role);
  const parGroupe = GROUPES.map((g) => ({ nom: g, liens: entrees.filter((e) => e.groupe === g) })).filter((g) => g.liens.length);

  const menu = parGroupe.map((g) => (
    <div key={g.nom} className="mb-3">
      <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-wy-doux">{g.nom}</p>
      {g.liens.map((e) => (
        <NavLink key={e.chemin} to={e.chemin} end={e.chemin === '/app'}
          className={({ isActive }) => `block border-l-[3px] px-4 py-1.5 text-[13px] ${isActive ? 'border-wy-azur bg-wy-fond font-bold text-wy-bleu' : 'border-transparent text-wy-texte hover:bg-wy-fond hover:text-wy-bleu'}`}>{e.libelle}</NavLink>
      ))}
    </div>
  ));

  return (
    <div className="flex min-h-screen flex-col bg-wy-fond font-sans text-wy-texte">
      <header className="sticky top-0 z-40 border-b border-wy-bord bg-white">
        <div className="flex h-12 items-center gap-4 px-4">
          <button className="border border-wy-bord px-2 py-1 text-[13px] lg:hidden" onClick={() => setMobile(!mobile)} aria-expanded={mobile} aria-label="Menu">☰</button>
          <Link to="/app" className="text-[22px] font-extrabold leading-none tracking-tight text-wy-texte" aria-label="SYSCOUT-HT, tableau de bord">syscout<span className="text-wy-azur">·</span></Link>
          <span className="ml-auto flex items-center gap-4 text-[12px] text-wy-doux">
            <Link to="/" className="hidden hover:text-wy-bleu sm:inline">Site public</Link>
            <span className="hidden md:inline">{utilisateur.prenom} {utilisateur.nom} · {utilisateur.role_libelle}</span>
            <Link to="/app/compte" className="hover:text-wy-bleu">Mon compte</Link>
            <button onClick={deconnexion} className="hover:text-wy-bleu">Déconnexion</button>
          </span>
        </div>
        {mobile ? <nav className="max-h-[70vh] overflow-y-auto border-t border-wy-bord bg-white py-2 lg:hidden" aria-label="Menu mobile">{menu}</nav> : null}
      </header>

      <div className="flex flex-1 items-stretch">
        <aside className="hidden w-52 shrink-0 border-r border-wy-bord bg-white lg:block">
          <nav className="sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto py-2" aria-label="Menu principal">{menu}</nav>
        </aside>
        <main className="dense min-w-0 flex-1 px-4 py-4"><Outlet /></main>
      </div>
      <Pied />
    </div>
  );
}
