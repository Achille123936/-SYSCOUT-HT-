import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, type Page } from '../lib/api';
import { GROUPES, nombre } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Badge, Bouton, Card, Champ, Choix, Etat, Pagination, Titre, Vide } from '../components/ui';

const TAILLE = 20;
const STATISTIQUES: [string, string][] = [['buts_p90', 'Buts / 90'], ['xg_p90', 'xG / 90'], ['tirs_p90', 'Tirs / 90'], ['passes_p90', 'Passes / 90'],
  ['passes_reussies_pct', 'Passes réussies %'], ['dribbles_p90', 'Dribbles / 90'], ['duels_gagnes_pct', 'Duels gagnés %'],
  ['recuperations_p90', 'Récupérations / 90'], ['interceptions_p90', 'Interceptions / 90']];
const VIDE = { q: '', groupe: '', division: '', age_min: '', age_max: '', indice_min: '', tri: '', pied_fort: '', taille_min: '', taille_max: '', minutes_min: '' };
interface Critere { stat: string; centile: string }

// CU05 / CU10 : recherche multicritère, liste triée par indice de performance
export default function Joueurs() {
  const [f, setF] = useState(VIDE);
  const [page, setPage] = useState(1);
  const [avancee, setAvancee] = useState(false);
  const [criteres, setCriteres] = useState<Critere[]>([]);
  const filtre = criteres.filter((c) => c.centile !== '').map((c) => `${c.stat}:${c.centile}`).join(',');
  const majCritere = (i: number, c: Partial<Critere>) => { setCriteres((l) => l.map((x, j) => (j === i ? { ...x, ...c } : x))); setPage(1); };
  const { a } = useAuth();
  const maj = (cle: string, v: string) => { setF((x) => ({ ...x, [cle]: v })); setPage(1); };
  const t = useChargement<Page<any>>(() => api.get('/joueurs/', { ...f, criteres: filtre, page, page_size: TAILLE }), [JSON.stringify(f), filtre, page]);

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
        <div className="mt-3 flex gap-2">
          <Bouton genre="secondaire" onClick={() => setAvancee(!avancee)} aria-expanded={avancee}>Recherche avancée {avancee ? '▲' : '▼'}</Bouton>
          <Bouton genre="secondaire" onClick={() => { setF(VIDE); setCriteres([]); setPage(1); }}>Effacer les filtres</Bouton>
        </div>
        {avancee ? (
          <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Choix libelle="Pied fort" value={f.pied_fort} onChange={(e) => maj('pied_fort', e.target.value)}>
                <option value="">Tous</option><option value="D">Droit</option><option value="G">Gauche</option><option value="2">Les deux</option>
              </Choix>
              <Champ libelle="Taille min. (cm)" type="number" min={100} max={230} value={f.taille_min} onChange={(e) => maj('taille_min', e.target.value)} />
              <Champ libelle="Taille max. (cm)" type="number" min={100} max={230} value={f.taille_max} onChange={(e) => maj('taille_max', e.target.value)} />
              <Champ libelle="Minutes jouées min." type="number" min={0} value={f.minutes_min} onChange={(e) => maj('minutes_min', e.target.value)} />
            </div>
            {criteres.map((c, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <div className="w-56"><Choix libelle="Statistique" value={c.stat} onChange={(e) => majCritere(i, { stat: e.target.value })}>{STATISTIQUES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix></div>
                <div className="w-40"><Champ libelle="Centile minimal" type="number" min={0} max={100} value={c.centile} onChange={(e) => majCritere(i, { centile: e.target.value })} /></div>
                <Bouton genre="secondaire" onClick={() => setCriteres((l) => l.filter((_, j) => j !== i))} aria-label="Retirer le critère">✕</Bouton>
              </div>
            ))}
            <Bouton genre="secondaire" onClick={() => setCriteres((l) => [...l, { stat: 'xg_p90', centile: '70' }])}>+ Critère statistique</Bouton>
            <p className="text-xs text-slate-500">Centile : position dans le même poste, saison courante (70 = mieux que 70 % des joueurs comparés).</p>
          </div>
        ) : null}
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
