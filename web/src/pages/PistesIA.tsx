import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useChargement } from '../lib/hooks';
import { Chaleur, Terrain } from '../components/Terrain';
import { Alerte, Badge, Bouton, Card, Etat, Titre } from '../components/ui';

// FR-052 / FR-055 : pistes de suivi du moteur IA. Une piste n'est pas un joueur : seul l'analyste fait le lien.
export default function PistesIA() {
  const { id } = useParams();
  const [piste, setPiste] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const pistes = useChargement<{ piste: string; joueur: number | null; points: number }[]>(async () => {
    const points = await api.get<any>('/pistes-ia/', { match: id });
    const par: Record<string, { piste: string; joueur: number | null; points: number }> = {};
    (Array.isArray(points) ? points : points.results).forEach((p: any) => {
      const e = (par[p.piste] ||= { piste: p.piste, joueur: p.joueur, points: 0 });
      e.points += 1;
    });
    return Object.values(par);
  }, [id]);
  const carte = useChargement<any>(() => api.get('/pistes-ia/heatmap/', { match: id, piste }), [id, piste]);

  const m = match.donnees;
  const nomJoueur = (j: number) => m?.compositions.find((c: any) => c.joueur === j)?.joueur_nom || 'Identifiée';
  const choisie = piste ? pistes.donnees?.find((p) => p.piste === piste) : undefined;
  const identifier = async (joueur: number | null) => {
    setMessage(null);
    try { await api.post('/pistes-ia/identifier/', { match: Number(id), piste, joueur }); pistes.recharger(); carte.recharger(); }
    catch (e) { setMessage((e as Error).message); }
  };

  return (
    <>
      <Titre titre="Pistes de l'IA" sous={m ? <>{m.domicile_nom} – {m.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></> : undefined} />
      <Etat {...pistes}>
        {pistes.donnees && !pistes.donnees.length ? <Alerte ton="bleu">Le moteur IA n'a envoyé aucune piste pour ce match.</Alerte> : null}
        {pistes.donnees?.length ? (
          <div className="space-y-6">
            <Alerte>Données du moteur IA, non vérifiées : elles ne comptent dans aucune statistique officielle.</Alerte>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card titre="Zones d'activité" className="lg:col-span-2" droite={carte.donnees ? <Badge ton="orange">{carte.donnees.points} points</Badge> : undefined}>
                <div className="mb-3 flex flex-wrap gap-2">
                  {[null, ...pistes.donnees.map((p) => p.piste)].map((p) => (
                    <button key={p ?? 'toutes'} onClick={() => setPiste(p)} className={`rounded-full border px-3 py-1 text-xs font-medium ${piste === p ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-slate-300 text-slate-600'}`}>{p ?? 'Toutes'}</button>
                  ))}
                </div>
                <Terrain derriere={carte.donnees?.points ? <Chaleur grille={carte.donnees.grille} maximum={carte.donnees.maximum} couleur="#F59E0B" /> : null} />
                <div className="mt-3 space-y-2">{carte.donnees?.avertissements.slice(1).map((a: string) => <Alerte key={a}>{a}</Alerte>)}</div>
              </Card>
              <Card titre="Pistes">
                <ul className="divide-y divide-slate-100 text-sm">
                  {pistes.donnees.map((p) => (
                    <li key={p.piste}><button onClick={() => setPiste(p.piste)} className={`flex w-full items-center justify-between gap-2 py-2 text-left ${piste === p.piste ? 'font-bold' : ''}`}>
                      <span>{p.piste} <span className="text-slate-400">· {p.points} pts</span></span>
                      <Badge ton={p.joueur ? 'vert' : 'orange'}>{p.joueur ? nomJoueur(p.joueur) : 'Non identifiée'}</Badge></button></li>
                  ))}
                </ul>
              </Card>
            </div>
            {choisie && m ? (
              <Card titre={`Relier la piste ${choisie.piste} à un joueur`}>
                <Alerte ton="bleu">Une piste n'est pas un joueur : seul l'analyste fait le lien (la composition du match est exigée).</Alerte>
                <div className="my-3"><Alerte ton="rouge">{message}</Alerte></div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {m.compositions.map((c: any) => (
                    <button key={c.joueur} onClick={() => identifier(c.joueur)} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50 ${choisie.joueur === c.joueur ? 'border-brand-green bg-emerald-50' : 'border-slate-200'}`}>
                      <span>{c.numero_maillot ? `${c.numero_maillot} · ` : ''}{c.joueur_nom}</span>{choisie.joueur === c.joueur ? <Badge ton="vert">Lié</Badge> : null}</button>
                  ))}
                </div>
                {choisie.joueur ? <Bouton genre="secondaire" className="mt-3" onClick={() => identifier(null)}>Détacher la piste</Bouton> : null}
              </Card>
            ) : null}
          </div>
        ) : null}
      </Etat>
    </>
  );
}
