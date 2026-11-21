import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, exporterPdf } from '../lib/api';
import { LIGNES_STATS, dateFR, nombre } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Radar from '../components/Radar';
import { Chaleur, Terrain, grilleDesActions } from '../components/Terrain';
import { useAuth } from '../lib/auth';
import Modal from '../components/Modal';
import { Alerte, Badge, Bouton, Card, Etat, Titre } from '../components/ui';

// Fiche joueur : statistiques de la saison, radar des centiles, carte des actions, historique des clubs.
export default function JoueurDetail() {
  const { id } = useParams();
  const { a } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [listes, setListes] = useState<any[] | null>(null);
  const [ajoute, setAjoute] = useState<string | null>(null);
  const t = useChargement<any>(() => api.get(`/joueurs/${id}/radar/`), [id]);
  const carte = useChargement<any>(() => api.get(`/joueurs/${id}/carte/`), [id]);
  const journal = useChargement<any>(() => api.get(`/joueurs/${id}/matchs/`), [id]);
  const d = t.donnees, j = d?.joueur, s = d?.statistique;
  const { grille, maximum } = grilleDesActions(carte.donnees?.actions || []);

  const ouvrirListes = async () => { setAjoute(null); try { setListes(await api.tout('/shortlists/')); } catch (e) { setMessage((e as Error).message); } };
  const ajouter = async (l: any) => { try { await api.post(`/shortlists/${l.id}/ajouter/`, { joueur: Number(id) }); setAjoute(`Ajouté à « ${l.nom} ».`); } catch (e) { setMessage((e as Error).message); } };
  const exporter = async () => { try { await exporterPdf({ type: 'joueur', id: Number(id) }); } catch (e) { setMessage((e as Error).message); } };

  return (
    <Etat {...t}>
      {d ? (
        <>
          <Titre titre={j.nom_complet} sous={`${j.poste_libelle} · ${j.club_nom} · ${j.age} ans${d.saison ? ` · saison ${d.saison.libelle}` : ''}`}
            droite={<div className="flex flex-wrap gap-2"><Link to={`/scout/joueur/${j.id}`}><Bouton genre="secondaire">Vue Scout</Bouton></Link><Link to={`/app/comparaison?ids=${j.id}`}><Bouton genre="secondaire">Comparer</Bouton></Link>{a('ADMIN', 'SCOUT', 'DIRECTEUR', 'CLIENT', 'CLUB_ADMIN', 'COACH') ? <Bouton genre="secondaire" onClick={ouvrirListes}>+ Shortlist</Bouton> : null}{a('ADMIN', 'ANALYSTE', 'CLUB_ADMIN') ? <Link to={`/app/joueurs/${j.id}/modifier`}><Bouton genre="secondaire">Modifier</Bouton></Link> : null}<Bouton onClick={exporter}>Exporter en PDF</Bouton></div>} />
          <div className="space-y-6">
            <Alerte ton="rouge">{message}</Alerte>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card titre="Indice de performance"><p className="text-5xl font-extrabold text-brand-green">{s?.indice_performance != null ? Math.round(s.indice_performance) : '—'}</p>
                <p className="mt-1 text-sm text-slate-500">sur 100, parmi les joueurs du même poste</p>
                {j.est_mineur ? <div className="mt-3"><Badge ton="orange">Joueur mineur : données protégées</Badge></div> : null}</Card>
              <Card titre="Radar des centiles" className="lg:col-span-2"><Radar series={[{ nom: j.nom_complet, couleur: '#2475D2', centiles: s?.centiles }]} /></Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card titre="Statistiques de la saison">
                {s ? (
                  <dl className="divide-y divide-slate-100 text-sm">
                    {LIGNES_STATS.map(([cle, nom, unite]) => (
                      <div key={cle} className="flex justify-between py-2"><dt className="text-slate-500">{nom}</dt><dd className="font-semibold text-navy">{nombre(s[cle], unite)}</dd></div>
                    ))}
                  </dl>
                ) : <p className="text-sm text-slate-500">Aucune statistique publiée pour cette saison.</p>}
              </Card>
              <Card titre="Sur le terrain" droite={carte.donnees ? <Badge ton="bleu">{carte.donnees.actions.length} actions</Badge> : undefined}>
                {carte.donnees?.actions.length ? <Terrain derriere={<Chaleur grille={grille} maximum={maximum} />} /> : <p className="text-sm text-slate-500">Pas encore d'action codée.</p>}
                <p className="mt-2 text-xs text-slate-500">Sens de l'attaque → · plus la case est foncée, plus le joueur y est actif.</p>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card titre="Historique des clubs">
                <ul className="divide-y divide-slate-100 text-sm">
                  {d.historique.map((h: any) => (
                    <li key={h.id} className="flex justify-between py-2"><span className="font-medium">{h.club_nom} <span className="text-slate-400">· {h.type_contrat_libelle}</span></span>
                      <span className="text-slate-500">{dateFR(h.date_debut)} → {h.date_fin ? dateFR(h.date_fin) : 'aujourd\'hui'}</span></li>
                  ))}
                </ul>
              </Card>
              <Card titre="Matchs de la saison">
                {journal.donnees?.matchs?.length ? (
                  <table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Match</th><th>Min.</th><th>Buts</th><th>Passes</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {journal.donnees.matchs.map((m: any) => (
                        <tr key={m.match}><td className="py-2"><Link className="text-navy hover:text-brand-blue" to={`/app/matchs/${m.match}`}>J{m.journee} · {m.domicile ? 'vs' : '@'} {m.adversaire}</Link> <span className="text-slate-400">{m.score}</span></td>
                          <td>{m.minutes_jouees}</td><td>{m.buts}</td><td>{m.passes_reussies_pct != null ? `${m.passes_reussies_pct} %` : '—'}</td></tr>
                      ))}
                    </tbody></table>
                ) : <p className="text-sm text-slate-500">Aucun match codé cette saison.</p>}
              </Card>
            </div>
          </div>
          <Modal titre="Ajouter à une shortlist" ouvert={listes !== null} onFermer={() => setListes(null)}>
            {ajoute ? <Alerte ton="vert">{ajoute}</Alerte> : null}
            <ul className="divide-y divide-slate-100 text-sm">{(listes || []).map((l) => <li key={l.id}><button className="flex w-full justify-between py-2 text-left hover:bg-slate-50" onClick={() => ajouter(l)}><span className="font-medium">{l.nom}</span><span className="text-slate-400">{l.nb_joueurs} joueur(s)</span></button></li>)}</ul>
            {listes && !listes.length ? <p className="text-sm text-slate-500">Aucune shortlist : créez-en une depuis la page Shortlists.</p> : null}
          </Modal>
        </>
      ) : null}
    </Etat>
  );
}
