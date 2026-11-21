import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useChargement } from '../lib/hooks';
import MatchsEnDirect from '../components/MatchsEnDirect';
import { Alerte, Card, Etat, Titre } from '../components/ui';

const ECRANS: Record<string, string> = { Matchs: '/app/matchs', Joueurs: '/app/joueurs', Cameras: '/app/cameras' };

// Tableau de bord adapté au rôle : chiffres clés, alertes, derniers résultats, meilleurs joueurs, matchs en direct.
export default function Dashboard() {
  const { utilisateur, a } = useAuth();
  const navigate = useNavigate();
  const t = useChargement<any>(() => api.get('/tableau-de-bord/'));
  const d = t.donnees;
  const voirDirect = a('ADMIN', 'ANALYSTE', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH');

  return (
    <>
      <Titre titre={`Bonjour ${utilisateur?.prenom}`} sous={`${utilisateur?.role_libelle}${d?.saison ? ` · saison ${d.saison.libelle}` : ''}`} />
      <Etat {...t}>
        {d ? (
          <div className="space-y-6">
            {d.alertes.map((x: string) => <Alerte key={x}>{x}</Alerte>)}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {d.cartes.map((c: any) => {
                const lien = c.ecran ? ECRANS[c.ecran] : undefined;
                const contenu = <><p className="text-3xl font-extrabold text-navy">{c.valeur}</p><p className="text-sm text-slate-500">{c.libelle}</p></>;
                return lien
                  ? <Link key={c.libelle} to={lien} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-blue">{contenu}</Link>
                  : <div key={c.libelle} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{contenu}</div>;
              })}
            </div>
            <Card titre="Matchs en direct">
              <MatchsEnDirect surOuvrir={voirDirect ? (m) => navigate(`/app/matchs/${m.id}/direct`) : undefined} />
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              {d.resultats.length ? (
                <Card titre="Derniers résultats" droite={<Link to="/app/matchs" className="text-sm text-brand-blue hover:underline">Tous les matchs ›</Link>}>
                  <ul className="divide-y divide-slate-100">
                    {d.resultats.map((m: any) => (
                      <li key={m.id}><Link to={`/app/matchs/${m.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                        <span className="flex-1 truncate text-right">{m.domicile}</span><span className="font-bold text-navy">{m.score}</span><span className="flex-1 truncate">{m.exterieur}</span>
                      </Link></li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {d.meilleurs.length ? (
                <Card titre="Meilleurs joueurs de la saison">
                  <ol className="divide-y divide-slate-100">
                    {d.meilleurs.map((j: any, i: number) => (
                      <li key={j.joueur}><Link to={`/app/joueurs/${j.joueur}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50">
                        <span className="w-5 text-slate-400">{i + 1}</span>
                        <span className="flex-1"><span className="block font-medium text-navy">{j.nom}</span><span className="text-xs text-slate-500">{j.club} · {j.poste}</span></span>
                        <span className="rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{Math.round(j.indice)}</span>
                      </Link></li>
                    ))}
                  </ol>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}
      </Etat>
    </>
  );
}
