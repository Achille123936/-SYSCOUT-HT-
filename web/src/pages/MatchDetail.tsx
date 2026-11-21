import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TON_ETAT, dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Badge, Bouton, Card, Etat, Titre } from '../components/ui';

// Fiche d'un match : état, compositions et accès au direct, aux pistes de l'IA.
export default function MatchDetail() {
  const { id } = useParams();
  const { a } = useAuth();
  const t = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const m = t.donnees;
  const analyste = a('ADMIN', 'ANALYSTE');

  return (
    <Etat {...t}>
      {m ? (
        <>
          <Titre titre={`${m.domicile_nom} ${m.score_domicile} – ${m.score_exterieur} ${m.exterieur_nom}`}
            sous={`${m.competition_nom} · J${m.journee} · ${dateHeureFR(m.date_match)}${m.stade ? ` · ${m.stade}` : ''}`}
            droite={<Badge ton={TON_ETAT[m.etat]}>{m.etat_libelle}</Badge>} />
          <div className="mb-6 flex flex-wrap gap-3">
            {m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/direct`}><Bouton>{m.verrouille_par_nom ? '● Suivre en direct' : 'Statistiques détaillées'}</Bouton></Link> : null}
            {analyste && m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/pistes-ia`}><Bouton genre="secondaire">Pistes de l'IA</Bouton></Link> : null}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[[m.club_domicile, m.domicile_nom], [m.club_exterieur, m.exterieur_nom]].map(([club, nom]) => (
              <Card key={club} titre={`Composition · ${nom}`}>
                {m.compositions.filter((c: any) => c.club === club).length ? (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {m.compositions.filter((c: any) => c.club === club).map((c: any) => (
                      <li key={c.id} className="flex items-center gap-3 py-2">
                        <span className="w-7 text-right font-bold text-slate-400">{c.numero_maillot ?? ''}</span>
                        <Link className="flex-1 font-medium text-navy hover:text-brand-blue" to={`/app/joueurs/${c.joueur}`}>{c.joueur_nom}</Link>
                        <span className="text-slate-400">{c.poste}</span>
                        <span className="w-12 text-right text-slate-500">{c.minutes_jouees}'</span>
                        {c.est_titulaire ? <Badge ton="vert">XI</Badge> : <Badge>Banc</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500">Composition non saisie.</p>}
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </Etat>
  );
}
