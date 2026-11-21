import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useChargement } from '../lib/hooks';
import { Alerte, Bouton, Card, Etat, Titre } from '../components/ui';

const CHAMPS: [string, string][] = [['distance_m', 'Distance (m)'], ['distance_sprint_m', 'Sprint (m)'], ['sprints', 'Sprints'], ['vitesse_max_kmh', 'Vitesse max (km/h)']];

// Données physiques d'un match : lecture pour tous, saisie manuelle pour l'analyste (le capteur GPS du téléphone les remplit aussi).
export default function Physique() {
  const { id } = useParams();
  const { a } = useAuth();
  const [lignes, setLignes] = useState<Record<number, Record<string, string>>>({});
  const [message, setMessage] = useState<{ ton: 'vert' | 'rouge'; texte: string } | null>(null);
  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const t = useChargement<any[]>(() => api.get(`/matchs/${id}/physique/`), [id]);
  const peutSaisir = a('ADMIN', 'ANALYSTE');

  useEffect(() => {
    const init: Record<number, Record<string, string>> = {};
    (t.donnees || []).forEach((d) => { init[d.joueur] = Object.fromEntries(CHAMPS.map(([c]) => [c, d[c] == null ? '' : String(d[c])])); });
    setLignes(init);
  }, [t.donnees]);

  const enregistrer = async () => {
    setMessage(null);
    const donnees = Object.entries(lignes).map(([joueur, v]) => ({
      joueur: Number(joueur), source: 'MANUEL', ...Object.fromEntries(CHAMPS.map(([c]) => [c, v[c] === '' || v[c] === undefined ? null : Number(v[c])])),
    }));
    try { await api.put(`/matchs/${id}/physique/`, { donnees }); setMessage({ ton: 'vert', texte: 'Données enregistrées.' }); t.recharger(); }
    catch (e) { setMessage({ ton: 'rouge', texte: (e as Error).message }); }
  };
  const compo: any[] = match.donnees?.compositions || [];

  return (
    <>
      <Titre titre="Données physiques" sous={match.donnees ? <>{match.donnees.domicile_nom} – {match.donnees.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></> : undefined} />
      {message ? <div className="mb-4"><Alerte ton={message.ton}>{message.texte}</Alerte></div> : null}
      <Etat {...t}>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Joueur</th>{CHAMPS.map(([, l]) => <th key={l} className="px-2 py-3">{l}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {compo.map((c) => (
                <tr key={c.joueur}>
                  <td className="px-4 py-2 font-medium">{c.joueur_nom}</td>
                  {CHAMPS.map(([champ]) => (
                    <td key={champ} className="px-2 py-1">
                      {peutSaisir
                        ? <input type="number" min={0} step="any" aria-label={`${c.joueur_nom} ${champ}`} value={lignes[c.joueur]?.[champ] ?? ''} onChange={(e) => setLignes({ ...lignes, [c.joueur]: { ...(lignes[c.joueur] || {}), [champ]: e.target.value } })} className="w-24 rounded border border-slate-300 px-2 py-1" />
                        : (t.donnees?.find((d) => d.joueur === c.joueur)?.[champ] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {peutSaisir ? <div className="mt-4"><Bouton onClick={enregistrer}>Enregistrer</Bouton></div> : null}
      </Etat>
    </>
  );
}
