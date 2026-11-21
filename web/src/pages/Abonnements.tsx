import { useState } from 'react';
import { api, exporterPdf, type Page } from '../lib/api';
import { dateFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Modal from '../components/Modal';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Titre, Vide } from '../components/ui';
import type { Ton } from '../lib/format';

const TON: Record<string, Ton> = { EN_ATTENTE: 'orange', ACTIF: 'vert', SUSPENDU: 'rouge', EXPIRE: 'gris', RESILIE: 'gris', IMPAYEE: 'rouge', PARTIELLE: 'orange', PAYEE: 'vert', ANNULEE: 'gris' };
const htg = (v: unknown) => `${Number(v).toLocaleString('fr-FR')} HTG`;

// CU13 / CU14 : abonnements des clubs clients, factures et paiements
export default function Abonnements() {
  const [creation, setCreation] = useState<any | null>(null);
  const [paiement, setPaiement] = useState<any | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const t = useChargement<Page<any>>(() => api.get('/abonnements/', { page_size: 100 }), []);
  const formules = useChargement<any[]>(() => api.tout('/formules/'), []);
  const clubs = useChargement<any[]>(() => api.tout('/clubs/'), []);

  const creer = async () => {
    setErreur(null);
    try { await api.post('/abonnements/', { ...creation, club: Number(creation.club), formule: Number(creation.formule), duree_mois: Number(creation.duree_mois) }); setCreation(null); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const encaisser = async () => {
    setErreur(null);
    try { await api.post('/paiements/', { facture: paiement.facture, montant_htg: paiement.montant, mode: paiement.mode, reference: paiement.reference }); setPaiement(null); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const act = async (chemin: string, corps: unknown = {}) => { setErreur(null); try { await api.post(chemin, corps); t.recharger(); } catch (e) { setErreur((e as Error).message); } };

  return (
    <>
      <Titre titre="Abonnements" sous="Clubs clients, factures et paiements."
        droite={<Bouton onClick={() => { setCreation({ club: '', formule: formules.donnees?.[0]?.id ?? '', date_debut: new Date().toISOString().slice(0, 10), duree_mois: '1' }); setErreur(null); }}>+ Nouvel abonnement</Bouton>} />
      <Alerte ton="rouge">{erreur}</Alerte>
      <Etat {...t}>
        {t.donnees && !t.donnees.results.length ? <Vide>Aucun abonnement.</Vide> : null}
        <div className="space-y-6">
          {(t.donnees?.results || []).map((a) => (
            <Card key={a.id} titre={<span>{a.club_nom} <span className="font-normal text-slate-500">· {a.formule_nom}</span></span>} droite={<Badge ton={TON[a.etat]}>{a.etat_libelle}</Badge>}>
              <p className="text-sm text-slate-500">{dateFR(a.date_debut)} → {dateFR(a.date_echeance)} · {a.duree_mois} mois · {htg(a.montant_htg)}</p>
              <div className="mt-3 flex gap-2">
                <Bouton genre="secondaire" onClick={() => act(`/abonnements/${a.id}/renouveler/`)}>Renouveler</Bouton>
                {!['RESILIE', 'EXPIRE'].includes(a.etat) ? <Bouton genre="secondaire" onClick={() => window.confirm('Résilier cet abonnement ?') && act(`/abonnements/${a.id}/resilier/`)}>Résilier</Bouton> : null}
              </div>
              {a.factures?.length ? (
                <table className="mt-4 w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Facture</th><th>Échéance</th><th className="text-right">TTC</th><th className="text-right">Solde</th><th className="pl-4">Statut</th><th /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {a.factures.map((f: any) => (
                      <tr key={f.id}><td className="py-2 font-medium">{f.numero_facture}</td><td>{dateFR(f.date_echeance)}</td><td className="text-right">{htg(f.montant_ttc)}</td><td className="text-right">{htg(f.solde_du)}</td><td className="pl-4"><Badge ton={TON[f.statut]}>{f.statut_libelle}</Badge></td>
                        <td className="space-x-2 py-2 text-right">
                          {['IMPAYEE', 'PARTIELLE'].includes(f.statut) ? <Bouton onClick={() => { setPaiement({ facture: f.id, numero: f.numero_facture, montant: f.solde_du, mode: 'ESPECES', reference: '' }); setErreur(null); }}>Encaisser</Bouton> : null}
                          <Bouton genre="secondaire" onClick={() => exporterPdf({ type: 'facture', id: f.id }).catch((e) => setErreur(e.message))}>PDF</Bouton></td></tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </Card>
          ))}
        </div>
      </Etat>
      <Modal titre="Nouvel abonnement" ouvert={!!creation} onFermer={() => setCreation(null)}>
        {creation ? (
          <div className="space-y-3"><Alerte ton="rouge">{erreur}</Alerte>
            <Choix libelle="Club" value={creation.club} onChange={(e) => setCreation({ ...creation, club: e.target.value })}><option value="">— choisir —</option>{(clubs.donnees || []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix>
            <Choix libelle="Formule" value={creation.formule} onChange={(e) => setCreation({ ...creation, formule: e.target.value })}>{(formules.donnees || []).map((f) => <option key={f.id} value={f.id}>{f.nom} · {htg(f.prix_mensuel_htg)}/mois</option>)}</Choix>
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Début" type="date" value={creation.date_debut} onChange={(e) => setCreation({ ...creation, date_debut: e.target.value })} /><Champ libelle="Durée (mois)" type="number" min={1} max={36} value={creation.duree_mois} onChange={(e) => setCreation({ ...creation, duree_mois: e.target.value })} /></div>
            <Bouton onClick={creer} disabled={!creation.club}>Créer</Bouton></div>
        ) : null}
      </Modal>
      <Modal titre={`Encaisser ${paiement?.numero || ''}`} ouvert={!!paiement} onFermer={() => setPaiement(null)}>
        {paiement ? (
          <div className="space-y-3"><Alerte ton="rouge">{erreur}</Alerte>
            <Champ libelle="Montant (HTG)" type="number" min={0} value={paiement.montant} onChange={(e) => setPaiement({ ...paiement, montant: e.target.value })} />
            <Choix libelle="Mode" value={paiement.mode} onChange={(e) => setPaiement({ ...paiement, mode: e.target.value })}><option value="ESPECES">Espèces</option><option value="VIREMENT">Virement</option><option value="MONCASH">MonCash</option></Choix>
            <Champ libelle="Référence" value={paiement.reference} onChange={(e) => setPaiement({ ...paiement, reference: e.target.value })} />
            <Bouton genre="succes" onClick={encaisser}>Enregistrer le paiement</Bouton></div>
        ) : null}
      </Modal>
    </>
  );
}
