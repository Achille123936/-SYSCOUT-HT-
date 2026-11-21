import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, type Page } from '../lib/api';
import { GROUPES, nombre } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Badge, Bouton, Card, Champ, Choix, Etat, Pagination, Titre, Vide } from '../components/ui';

const TAILLE = 20;

// CU05 / CU10 : recherche multicritère, liste triée par indice de performance
export default function Joueurs() {
  const [f, setF] = useState({ q: '', groupe: '', division: '', age_min: '', age_max: '', indice_min: '', tri: '' });
  const [page, setPage] = useState(1);
  const { a } = useAuth();
  const maj = (cle: string, v: string) => { setF((x) => ({ ...x, [cle]: v })); setPage(1); };
  const t = useChargement<Page<any>>(() => api.get('/joueurs/', { ...f, page, page_size: TAILLE }), [JSON.stringify(f), page]);

  return (
    <>
      <Titre titre="Joueurs" sous="Recherche par nom, poste, division, âge et indice de performance." droite={a('ADMIN', 'ANALYSTE', 'SCOUT', 'CLUB_ADMIN') ? <Link to="/app/joueurs/nouveau"><Bouton>+ Nouveau joueur</Bouton></Link> : undefined} />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2"><Champ libelle="Nom" placeholder="Rechercher…" value={f.q} onChange={(e) => maj('q', e.target.value)} /></div>
          <Choix libelle="Poste" value={f.groupe} onChange={(e) => maj('groupe', e.target.value)}>
            <option value="">Tous</option>{GROUPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Choix>
          <Choix libelle="Division" value={f.division} onChange={(e) => maj('division', e.target.value)}>
            <option value="">Toutes</option><option value="D1">D1</option><option value="D2">D2</option><option value="ACADEMIE">Académies</option>
          </Choix>
          <Champ libelle="Âge min." type="number" min={10} max={50} value={f.age_min} onChange={(e) => maj('age_min', e.target.value)} />
          <Champ libelle="Âge max." type="number" min={10} max={50} value={f.age_max} onChange={(e) => maj('age_max', e.target.value)} />
          <Champ libelle="Indice minimal" type="number" min={0} max={100} value={f.indice_min} onChange={(e) => maj('indice_min', e.target.value)} />
          <Choix libelle="Tri" value={f.tri} onChange={(e) => maj('tri', e.target.value)}>
            <option value="">Indice décroissant</option><option value="nom">Nom</option>
          </Choix>
        </div>
      </Card>
      <Etat {...t}>
        {t.donnees ? (
          <Card className="overflow-x-auto p-0">
            {t.donnees.results.length ? (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Joueur</th><th className="px-4 py-3">Poste</th><th className="px-4 py-3">Club</th><th className="px-4 py-3">Âge</th><th className="px-4 py-3 text-right">Indice</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {t.donnees.results.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium"><Link className="text-navy hover:text-brand-blue" to={`/app/joueurs/${j.id}`}>{j.nom_complet}</Link>{j.est_mineur ? <span className="ml-2"><Badge ton="orange">Mineur</Badge></span> : null}</td>
                      <td className="px-4 py-3">{j.poste_libelle}</td><td className="px-4 py-3">{j.club_nom}</td><td className="px-4 py-3">{j.age} ans</td>
                      <td className="px-4 py-3 text-right font-bold text-navy">{j.indice_performance != null ? Math.round(j.indice_performance) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Vide>Aucun joueur ne correspond à ces critères.</Vide>}
          </Card>
        ) : null}
        {t.donnees ? <Pagination page={page} total={t.donnees.count} taille={TAILLE} onChange={setPage} /> : null}
      </Etat>
      <p className="mt-3 text-xs text-slate-400">{t.donnees ? `${nombre(t.donnees.count)} joueur(s)` : ''}</p>
    </>
  );
}
