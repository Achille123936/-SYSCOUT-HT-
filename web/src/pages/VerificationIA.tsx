import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { TYPES_ACTION } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Modal from '../components/Modal';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Titre, Vide } from '../components/ui';
import type { Ton } from '../lib/format';

const STATUTS: Record<string, [string, Ton]> = {
  PENDING: ['En attente', 'orange'], APPROVED: ['Confirmée', 'vert'], CORRECTED: ['Corrigée', 'bleu'],
  REJECTED: ['Rejetée', 'rouge'], UNVERIFIED: ['Non vérifiée', 'gris'],
};

// SRS §10 (Human-in-the-Loop) : l'IA propose ; l'analyste confirme, corrige ou rejette. Chaque décision est historisée.
export default function VerificationIA() {
  const { id } = useParams();
  const [filtre, setFiltre] = useState('PENDING');
  const [choisie, setChoisie] = useState<any | null>(null);
  const [champs, setChamps] = useState<{ joueur: string; type_action: string; minute: string }>({ joueur: '', type_action: '', minute: '' });
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const t = useChargement<any[]>(() => api.get(`/propositions-ia/`, { match: id, statut: filtre }), [id, filtre]);

  const ouvrir = (p: any) => { setChoisie(p); setErreur(null); setCommentaire(''); setChamps({ joueur: p.joueur ? String(p.joueur) : '', type_action: p.type_action, minute: String(p.minute) }); };
  const decider = async (decision: 'confirmer' | 'corriger' | 'rejeter') => {
    setErreur(null);
    try {
      const corps: Record<string, unknown> = { decision, commentaire };
      if (decision === 'corriger') { corps.joueur = champs.joueur ? Number(champs.joueur) : null; corps.type_action = champs.type_action; corps.minute = Number(champs.minute); }
      await api.post(`/propositions-ia/${choisie.id}/valider/`, corps);
      setChoisie(null); t.recharger();
    } catch (e) { setErreur((e as Error).message); }
  };
  const compo: any[] = match.donnees?.compositions || [];

  return (
    <>
      <Titre titre="Propositions de l'IA" sous={match.donnees ? <>{match.donnees.domicile_nom} – {match.donnees.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></> : undefined} />
      <Alerte ton="bleu">Une proposition n'entre dans aucune statistique avant votre décision. La décision exige que vous ayez ouvert le codage du match.</Alerte>
      <div className="my-4 flex gap-2">
        {[['PENDING', 'En attente'], ['APPROVED,CORRECTED', 'Décidées'], ['REJECTED', 'Rejetées'], ['UNVERIFIED', 'Non vérifiées']].map(([v, l]) => (
          <button key={v} onClick={() => setFiltre(v)} className={`rounded-full border px-3 py-1 text-sm font-medium ${filtre === v ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-slate-300 text-slate-600'}`}>{l}</button>
        ))}
      </div>
      <Etat {...t}>
        {t.donnees ? (
          <Card className="overflow-x-auto p-0">
            {t.donnees.length ? (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Min.</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Joueur</th><th className="px-4 py-3">Piste</th><th className="px-4 py-3">Confiance</th><th className="px-4 py-3">Statut</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {t.donnees.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">{p.minute}'</td><td className="px-4 py-3 font-medium">{p.type_libelle}</td>
                      <td className="px-4 py-3">{p.joueur_nom || <span className="text-brand-orange">non identifié{p.numero_maillot ? ` (n° ${p.numero_maillot})` : ''}</span>}</td>
                      <td className="px-4 py-3 text-slate-500">{p.piste || '—'}</td>
                      <td className="px-4 py-3"><span className={p.confiance < 0.6 ? 'font-semibold text-brand-orange' : ''}>{Math.round(p.confiance * 100)} %</span></td>
                      <td className="px-4 py-3"><Badge ton={STATUTS[p.statut]?.[1]}>{STATUTS[p.statut]?.[0] || p.statut}</Badge></td>
                      <td className="px-4 py-3 text-right">{['PENDING', 'UNVERIFIED'].includes(p.statut) ? <Bouton genre="secondaire" onClick={() => ouvrir(p)}>Vérifier</Bouton> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Vide>Aucune proposition dans cette catégorie.</Vide>}
          </Card>
        ) : null}
      </Etat>
      <Modal titre="Vérifier la proposition" ouvert={!!choisie} onFermer={() => setChoisie(null)}>
        {choisie ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Vidéo à {Math.floor(choisie.temps_video / 60)} min {choisie.temps_video % 60} s · confiance {Math.round(choisie.confiance * 100)} % · modèle {choisie.modele || 'inconnu'}</p>
            <Alerte ton="rouge">{erreur}</Alerte>
            <div className="grid grid-cols-2 gap-3">
              <Choix libelle="Action" value={champs.type_action} onChange={(e) => setChamps({ ...champs, type_action: e.target.value })}>
                {Object.entries(TYPES_ACTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
              <Champ libelle="Minute" type="number" min={0} value={champs.minute} onChange={(e) => setChamps({ ...champs, minute: e.target.value })} />
            </div>
            <Choix libelle="Joueur" value={champs.joueur} onChange={(e) => setChamps({ ...champs, joueur: e.target.value })}>
              <option value="">— non identifié —</option>
              {compo.map((c) => <option key={c.joueur} value={c.joueur}>{c.numero_maillot ? `${c.numero_maillot} · ` : ''}{c.joueur_nom}</option>)}</Choix>
            <Champ libelle="Commentaire (facultatif)" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={300} />
            <div className="flex flex-wrap gap-2">
              <Bouton genre="succes" onClick={() => decider('confirmer')}>Confirmer</Bouton>
              <Bouton onClick={() => decider('corriger')}>Corriger</Bouton>
              <Bouton genre="danger" onClick={() => decider('rejeter')}>Rejeter</Bouton>
            </div>
            <p className="text-xs text-slate-500">« Confirmer » exige que le joueur soit déjà identifié par l'IA ; sinon choisissez-le puis « Corriger ».</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
