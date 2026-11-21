import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Page } from '../lib/api';
import { ETATS_MATCH, TON_ETAT, dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Badge, Bouton, Card, Choix, Etat, Pagination, Titre, Vide } from '../components/ui';

const TAILLE = 20;

export default function Matchs() {
  const [etat, setEtat] = useState('');
  const [page, setPage] = useState(1);
  const { a } = useAuth();
  const t = useChargement<Page<any>>(() => api.get('/matchs/', { etat, page, page_size: TAILLE }), [etat, page]);

  return (
    <>
      <Titre titre="Matchs" sous="Rencontres, compositions et suivi en direct." droite={a('ADMIN', 'ANALYSTE') ? <Link to="/app/matchs/nouveau"><Bouton>+ Nouveau match</Bouton></Link> : undefined} />
      <Card className="mb-6"><div className="max-w-xs">
        <Choix libelle="État" value={etat} onChange={(e) => { setEtat(e.target.value); setPage(1); }}>
          <option value="">Tous</option>{ETATS_MATCH.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Choix></div></Card>
      <Etat {...t}>
        {t.donnees ? (
          <>
            <Card className="overflow-x-auto p-0">
              {t.donnees.results.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Compétition</th><th className="px-4 py-3 text-right">Domicile</th><th className="px-2 py-3 text-center">Score</th><th className="px-4 py-3">Extérieur</th><th className="px-4 py-3">État</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {t.donnees.results.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateHeureFR(m.date_match)}</td>
                        <td className="px-4 py-3">{m.competition_nom} · J{m.journee}</td>
                        <td className="px-4 py-3 text-right font-medium"><Link className="text-navy hover:text-brand-blue" to={`/app/matchs/${m.id}`}>{m.domicile_nom}</Link></td>
                        <td className="px-2 py-3 text-center font-bold text-navy">{m.score_domicile} – {m.score_exterieur}</td>
                        <td className="px-4 py-3 font-medium"><Link className="text-navy hover:text-brand-blue" to={`/app/matchs/${m.id}`}>{m.exterieur_nom}</Link></td>
                        <td className="px-4 py-3"><Badge ton={TON_ETAT[m.etat]}>{m.etat_libelle}</Badge>{m.verrouille_par_nom ? <span className="ml-2 text-xs text-slate-400">codé par {m.verrouille_par_nom}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Vide>Aucun match.</Vide>}
            </Card>
            <Pagination page={page} total={t.donnees.count} taille={TAILLE} onChange={setPage} />
          </>
        ) : null}
      </Etat>
    </>
  );
}
