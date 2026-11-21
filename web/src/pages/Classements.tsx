import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Page } from '../lib/api';
import { GROUPES, nombre } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Badge, Card, Choix, Etat, Pagination, Titre, Vide } from '../components/ui';

const TRIS: [string, string][] = [
  ['indice_performance', 'Indice de performance'], ['buts', 'Buts'], ['xg', 'xG'], ['passes_decisives', 'Passes décisives'],
  ['passes_reussies_pct', 'Passes réussies %'], ['duels_gagnes_pct', 'Duels gagnés %'], ['recuperations_p90', 'Récupérations /90'],
  ['interceptions_p90', 'Interceptions /90'], ['buts_tete', 'Buts de la tête'], ['xg_tete_p90', 'xG de la tête /90'],
];
const TAILLE = 25;

// Classements par poste (RG5 : au moins 450 minutes jouées)
export default function Classements() {
  const [groupe, setGroupe] = useState('');
  const [tri, setTri] = useState('indice_performance');
  const [page, setPage] = useState(1);
  const t = useChargement<Page<any>>(() => api.get('/statistiques/', { groupe, tri, page, page_size: TAILLE }), [groupe, tri, page]);

  return (
    <>
      <Titre titre="Statistiques" sous="Classement des joueurs de la saison, au moins 450 minutes jouées." />
      <Card className="mb-6"><div className="grid max-w-xl grid-cols-2 gap-3">
        <Choix libelle="Poste" value={groupe} onChange={(e) => { setGroupe(e.target.value); setPage(1); }}><option value="">Tous</option>{GROUPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
        <Choix libelle="Classer par" value={tri} onChange={(e) => { setTri(e.target.value); setPage(1); }}>{TRIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
      </div></Card>
      <Etat {...t}>
        {t.donnees ? (
          <>
            <Card className="overflow-x-auto p-0">
              {t.donnees.results.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Joueur</th><th className="px-4 py-3">Club</th><th className="px-3 py-3 text-right">Min.</th><th className="px-3 py-3 text-right">Buts</th><th className="px-3 py-3 text-right">Passes déc.</th><th className="px-3 py-3 text-right">xG</th><th className="px-3 py-3 text-right">Indice</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {t.donnees.results.map((s, i) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-400">{(page - 1) * TAILLE + i + 1}</td>
                        <td className="px-4 py-3 font-medium"><Link className="text-navy hover:text-brand-blue" to={`/app/joueurs/${s.joueur}`}>{s.joueur_nom}</Link> <span className="text-slate-400">{s.poste}</span></td>
                        <td className="px-4 py-3">{s.club_nom}</td>
                        <td className="px-3 py-3 text-right">{s.minutes_jouees}</td><td className="px-3 py-3 text-right">{s.buts}</td><td className="px-3 py-3 text-right">{s.passes_decisives}</td>
                        <td className="px-3 py-3 text-right">{nombre(s.xg)}</td>
                        <td className="px-3 py-3 text-right">{s.indice_performance != null ? <Badge ton="vert">{Math.round(s.indice_performance)}</Badge> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Vide>Aucun joueur classé.</Vide>}
            </Card>
            <Pagination page={page} total={t.donnees.count} taille={TAILLE} onChange={setPage} />
          </>
        ) : null}
      </Etat>
    </>
  );
}
