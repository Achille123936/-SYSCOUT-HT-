import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TON_ETAT, dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { useState } from 'react';
import { Alerte, Badge, Bouton, Card, Etat, Titre } from '../components/ui';

// Fiche d'un match : état, compositions et accès au direct, aux pistes de l'IA.
export default function MatchDetail() {
  const { id } = useParams();
  const { a } = useAuth();
  const t = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const m = t.donnees;
  const analyste = a('ADMIN', 'ANALYSTE');
  const [erreur, setErreur] = useState<string | null>(null);
  const corriger = async () => { if (!window.confirm("Rouvrir le codage ? Les statistiques du match sont retirées de la saison jusqu'à la nouvelle validation.")) return; try { await api.post(`/matchs/${id}/corriger/`); t.recharger(); } catch (e) { setErreur((e as Error).message); } };
  const annuler = async () => { if (!window.confirm('Annuler ce match ?')) return; try { await api.post(`/matchs/${id}/annuler/`); t.recharger(); } catch (e) { setErreur((e as Error).message); } };

  return (
    <Etat {...t}>
      {m ? (
        <>
          <Titre titre={`${m.domicile_nom} ${m.score_domicile} – ${m.score_exterieur} ${m.exterieur_nom}`}
            sous={`${m.competition_nom} · J${m.journee} · ${dateHeureFR(m.date_match)}${m.stade ? ` · ${m.stade}` : ''}`}
            droite={<Badge ton={TON_ETAT[m.etat]}>{m.etat_libelle}</Badge>} />
          <div className="mb-6 flex flex-wrap gap-3">
            {m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/direct`}><Bouton>{m.verrouille_par_nom ? '● Suivre en direct' : 'Statistiques détaillées'}</Bouton></Link> : null}
            {analyste && ['VIDEO_IMPORTEE', 'EN_CODAGE'].includes(m.etat) ? <Link to={`/app/matchs/${m.id}/codage`}><Bouton genre="succes">Coder le match</Bouton></Link> : null}
            {analyste && ['CODE', 'STATS_PUBLIEES'].includes(m.etat) ? <Bouton genre="secondaire" onClick={corriger}>Corriger le codage</Bouton> : null}
            {m.nb_evenements ? <Link to={`/app/matchs/${m.id}/tactique`}><Bouton genre="secondaire">Analyse tactique</Bouton></Link> : null}
            {m.video_lecture ? <Link to={`/app/matchs/${m.id}/relecture`}><Bouton genre="secondaire">Relecture</Bouton></Link> : null}
            {m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/physique`}><Bouton genre="secondaire">Données physiques</Bouton></Link> : null}
            {analyste && m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/capteur`}><Bouton genre="secondaire">Capteur GPS</Bouton></Link> : null}
            {analyste && m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/verification-ia`}><Bouton genre="secondaire">Propositions de l'IA</Bouton></Link> : null}
            {analyste && m.etat !== 'PLANIFIE' && m.etat !== 'ANNULE' ? <Link to={`/app/matchs/${m.id}/pistes-ia`}><Bouton genre="secondaire">Pistes de l'IA</Bouton></Link> : null}
            {analyste && !['CODE', 'STATS_PUBLIEES', 'ANNULE'].includes(m.etat) ? <Link to={`/app/matchs/${m.id}/modifier`}><Bouton genre="secondaire">Modifier</Bouton></Link> : null}
            {analyste && !['CODE', 'STATS_PUBLIEES', 'ANNULE'].includes(m.etat) ? <Bouton genre="danger" onClick={annuler}>Annuler le match</Bouton> : null}
          </div>
          <Alerte ton="rouge">{erreur}</Alerte>
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
