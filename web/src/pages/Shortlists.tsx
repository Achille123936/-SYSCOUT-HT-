import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useChargement } from '../lib/hooks';
import { Alerte, Bouton, Card, Champ, Etat, Titre, Vide } from '../components/ui';

// CU10 : listes de joueurs suivis. Un joueur s'ajoute depuis sa fiche ou ici ; 2 à 5 joueurs se comparent.
export default function Shortlists() {
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const t = useChargement<any[]>(() => api.tout('/shortlists/'), []);

  const creer = async () => {
    if (!nom.trim()) return; setErreur(null);
    try { await api.post('/shortlists/', { nom: nom.trim() }); setNom(''); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const retirer = async (liste: any, joueur: number) => { try { await api.post(`/shortlists/${liste.id}/retirer/`, { joueur }); t.recharger(); } catch (e) { setErreur((e as Error).message); } };
  const supprimer = async (liste: any) => { if (!window.confirm(`Supprimer « ${liste.nom} » ?`)) return; try { await api.delete(`/shortlists/${liste.id}/`); t.recharger(); } catch (e) { setErreur((e as Error).message); } };

  return (
    <>
      <Titre titre="Shortlists" sous="Listes de joueurs suivis." />
      <Card className="mb-6"><div className="flex max-w-md items-end gap-3"><div className="flex-1"><Champ libelle="Nouvelle liste" placeholder="Attaquants U21" value={nom} onChange={(e) => setNom(e.target.value)} /></div><Bouton onClick={creer}>Créer</Bouton></div></Card>
      <Alerte ton="rouge">{erreur}</Alerte>
      <Etat {...t}>
        {t.donnees && !t.donnees.length ? <Vide>Aucune shortlist. Créez-en une ci-dessus, puis ajoutez des joueurs depuis leur fiche.</Vide> : null}
        <div className="space-y-6">
          {(t.donnees || []).map((l) => (
            <Card key={l.id} titre={`${l.nom} (${l.nb_joueurs})`} droite={<div className="flex gap-2">
              {l.joueurs_detail.length >= 2 ? <Link to={`/app/comparaison?ids=${l.joueurs_detail.slice(0, 5).map((j: any) => j.id).join(',')}`}><Bouton genre="secondaire">Comparer</Bouton></Link> : null}
              <Bouton genre="secondaire" onClick={() => supprimer(l)}>Supprimer</Bouton></div>}>
              {l.joueurs_detail.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {l.joueurs_detail.map((j: any) => (
                    <li key={j.id} className="flex items-center gap-3 py-2"><Link className="flex-1 font-medium text-navy hover:text-brand-blue" to={`/app/joueurs/${j.id}`}>{j.nom_complet}</Link><span className="text-slate-500">{j.poste_libelle} · {j.club_nom}</span><span className="w-10 text-right font-bold">{j.indice_performance != null ? Math.round(j.indice_performance) : '—'}</span><button aria-label="Retirer" className="text-slate-400 hover:text-brand-red" onClick={() => retirer(l, j.id)}>✕</button></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">Liste vide.</p>}
            </Card>
          ))}
        </div>
      </Etat>
    </>
  );
}
