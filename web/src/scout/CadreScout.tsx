import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Chargement } from '../components/ui';

interface Resultat { type: 'joueur' | 'equipe'; id: number; nom: string; detail: string }

// Cadre de l'interface « Scout » : barre blanche (marque, recherche d'un joueur ou d'une équipe, retour à l'application).
export default function CadreScout() {
  const { utilisateur, pret } = useAuth();
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const lieu = useLocation();

  useEffect(() => {
    if (q.trim().length < 2) { setResultats([]); return; }
    const m = setTimeout(async () => {
      try {
        const [j, c] = await Promise.all([api.get<Page<any>>('/joueurs/', { q, page_size: 6 }), api.get<Page<any>>('/clubs/', { q, page_size: 4 })]);
        setResultats([
          ...j.results.map((x) => ({ type: 'joueur' as const, id: x.id, nom: x.nom_complet, detail: `${x.poste_libelle} · ${x.club_nom}` })),
          ...c.results.map((x) => ({ type: 'equipe' as const, id: x.id, nom: x.nom, detail: `${x.division_libelle} · ${x.ville}` })),
        ]);
        setOuvert(true);
      } catch { setResultats([]); }
    }, 250);
    return () => clearTimeout(m);
  }, [q]);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);

  if (!pret) return <div className="p-10"><Chargement /></div>;
  if (!utilisateur) return <Navigate to="/connexion" replace state={{ de: lieu.pathname }} />;

  const aller = (r: Resultat) => { setOuvert(false); setQ(''); navigate(r.type === 'joueur' ? `/scout/joueur/${r.id}` : `/scout/equipe/${r.id}`); };
  return (
    <div className="min-h-screen bg-wy-fond font-sans text-wy-texte">
      <header className="border-b border-wy-bord bg-white">
        <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-4 px-4">
          <Link to="/scout" className="text-[22px] font-extrabold leading-none tracking-tight text-wy-texte">syscout<span className="text-wy-azur">·</span></Link>
          <div ref={boite} className="relative w-full max-w-xs">
            <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => resultats.length && setOuvert(true)} placeholder="Enter a Player or a Team"
              aria-label="Rechercher un joueur ou une équipe" className="w-full border border-wy-bord bg-white py-1.5 pl-3 pr-3 text-[13px] outline-none focus:border-wy-azur" />
            {ouvert && resultats.length ? (
              <ul className="absolute left-0 right-0 top-full z-50 border border-wy-bord bg-white shadow-lg" role="listbox">
                {resultats.map((r) => (
                  <li key={`${r.type}${r.id}`}><button onClick={() => aller(r)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-wy-fond">
                    <span><span className="mr-2 inline-block w-14 text-[10px] font-bold uppercase text-wy-azur">{r.type === 'joueur' ? 'Joueur' : 'Équipe'}</span>{r.nom}</span><span className="text-[11px] text-wy-doux">{r.detail}</span></button></li>
                ))}
              </ul>
            ) : null}
          </div>
          <nav className="ml-auto flex items-center gap-4 text-[12px] text-wy-doux" aria-label="Liens">
            <Link to="/scout/matchs" className="hover:text-wy-bleu">Matchs</Link>
            <Link to="/app" className="hover:text-wy-bleu">Application classique</Link>
            <span className="hidden sm:inline">{utilisateur.prenom} {utilisateur.nom}</span>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
