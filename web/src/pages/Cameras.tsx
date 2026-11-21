import { useState } from 'react';
import { api } from '../lib/api';
import { TON_ETAT, dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Alerte, Badge, Bouton, Card, Etat, Titre, Vide } from '../components/ui';

// MOD-05 : état et qualité du flux de chaque caméra (FR-041), vérification à la demande.
export default function Cameras() {
  const [message, setMessage] = useState<string | null>(null);
  const [verif, setVerif] = useState<number | null>(null);
  const t = useChargement<any[]>(() => api.tout('/cameras/'), []);
  const parStade: Record<string, any[]> = {};
  (t.donnees || []).forEach((c) => { (parStade[c.stade] ||= []).push(c); });

  const verifier = async (c: any) => {
    setVerif(c.id); setMessage(null);
    try { await api.post(`/cameras/${c.id}/verifier/`); await t.recharger(); } catch (e) { setMessage((e as Error).message); }
    setVerif(null);
  };

  return (
    <>
      <Titre titre="Caméras" sous="Caméras des stades : état du flux, qualité et calibrage du terrain." />
      <Alerte ton="rouge">{message}</Alerte>
      <Etat {...t}>
        {t.donnees && !t.donnees.length ? <Vide>Aucune caméra installée.</Vide> : null}
        <div className="space-y-6">
          {Object.entries(parStade).map(([stade, cameras]) => (
            <Card key={stade} titre={stade}>
              <ul className="divide-y divide-slate-100">
                {cameras.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{c.nom} <Badge ton={TON_ETAT[c.etat]}>{c.etat_libelle}</Badge>{!c.active ? <span className="ml-2"><Badge>Inactive</Badge></span> : null}</p>
                      <p className="text-slate-500">{c.protocole_libelle} · {c.hauteur}p · {c.fps} i/s{c.latence_ms != null && c.etat === 'EN_LIGNE' ? ` · répond en ${c.latence_ms} ms` : ''}{c.derniere_verification ? ` · vérifiée ${dateHeureFR(c.derniere_verification)}` : ''}</p>
                      <p className="truncate text-xs text-slate-400">{c.url_flux_affichee}{c.message_etat ? ` — ${c.message_etat}` : ''}</p>
                      <p className="text-xs text-slate-400">{c.calibrage ? `Terrain calibré (${c.calibrage.reference})` : 'Terrain non calibré (FR-043)'}{c.match_en_cours ? ' · filme un match' : ''}</p>
                    </div>
                    <Bouton genre="secondaire" disabled={verif === c.id} onClick={() => verifier(c)}>{verif === c.id ? 'Vérification…' : 'Vérifier'}</Bouton>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Etat>
    </>
  );
}
