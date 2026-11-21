import { useEffect, useState } from 'react';
import { api, exporterPdf, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Modal from '../components/Modal';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Pagination, Titre, Vide } from '../components/ui';
import type { Ton } from '../lib/format';

const ETATS: [string, string, Ton][] = [['BROUILLON', 'Brouillon', 'gris'], ['SOUMIS', 'Soumis', 'bleu'], ['RENVOYE', 'Renvoyé', 'orange'], ['VALIDE', 'Validé', 'vert'], ['ARCHIVE', 'Archivé', 'gris']];
const RECO: [string, string][] = [['RECRUTER', 'Recruter'], ['SUIVRE', 'Suivre'], ['NE_PAS_RETENIR', 'Ne pas retenir']];
const TAILLE = 20;
const VIDE = { id: 0, joueur: '', forces: '', faiblesses: '', note: '7', recommandation: 'SUIVRE', match_observe: '' };

// CU11 / CU12 : rapports de scouting. Le scout rédige et soumet ; le directeur sportif valide ou renvoie.
export default function Rapports() {
  const { a } = useAuth();
  const [etat, setEtat] = useState('');
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState<any | null>(null);
  const [edition, setEdition] = useState<typeof VIDE | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const t = useChargement<Page<any>>(() => api.get('/rapports/', { etat, page, page_size: TAILLE }), [etat, page]);
  const scout = a('SCOUT', 'ADMIN');

  useEffect(() => {
    if (!edition || recherche.trim().length < 2) { setSuggestions([]); return; }
    const m = setTimeout(() => api.get<Page<any>>('/joueurs/', { q: recherche, page_size: 6 }).then((r) => setSuggestions(r.results)).catch(() => {}), 250);
    return () => clearTimeout(m);
  }, [recherche, edition]);

  const action = async (r: any, nom: string, corps: unknown = {}) => {
    setErreur(null);
    try { await api.post(`/rapports/${r.id}/${nom}/`, corps); setOuvert(null); setCommentaire(''); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const sauver = async () => {
    if (!edition) return; setErreur(null);
    const corps = { joueur: Number(edition.joueur), forces: edition.forces, faiblesses: edition.faiblesses, note: Number(edition.note), recommandation: edition.recommandation, match_observe: edition.match_observe ? Number(edition.match_observe) : null };
    try { if (edition.id) await api.patch(`/rapports/${edition.id}/`, corps); else await api.post('/rapports/', corps); setEdition(null); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const etatDe = (e: string) => ETATS.find(([v]) => v === e);

  return (
    <>
      <Titre titre="Rapports de scouting" sous="Brouillon, soumission, validation par le directeur sportif."
        droite={scout ? <Bouton onClick={() => { setEdition({ ...VIDE }); setRecherche(''); setErreur(null); }}>+ Nouveau rapport</Bouton> : undefined} />
      <Card className="mb-6"><div className="max-w-xs"><Choix libelle="État" value={etat} onChange={(e) => { setEtat(e.target.value); setPage(1); }}><option value="">Tous</option>{ETATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix></div></Card>
      <Etat {...t}>
        {t.donnees ? (
          <>
            <Card className="overflow-x-auto p-0">
              {t.donnees.results.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Joueur</th><th className="px-4 py-3">Scout</th><th className="px-4 py-3">Date</th><th className="px-3 py-3 text-right">Note</th><th className="px-4 py-3">Recommandation</th><th className="px-4 py-3">État</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {t.donnees.results.map((r) => (
                      <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => { setOuvert(r); setErreur(null); setCommentaire(''); }}>
                        <td className="px-4 py-3 font-medium text-navy">{r.joueur_nom} <span className="text-slate-400">{r.joueur_club}</span></td><td className="px-4 py-3">{r.scout_nom}</td><td className="px-4 py-3">{dateFR(r.date_rapport)}</td>
                        <td className="px-3 py-3 text-right font-bold">{r.note}/10</td><td className="px-4 py-3">{r.recommandation_libelle}</td><td className="px-4 py-3"><Badge ton={etatDe(r.etat)?.[2]}>{r.etat_libelle}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Vide>Aucun rapport.</Vide>}
            </Card>
            <Pagination page={page} total={t.donnees.count} taille={TAILLE} onChange={setPage} />
          </>
        ) : null}
      </Etat>

      <Modal titre={ouvert ? `Rapport sur ${ouvert.joueur_nom}` : ''} ouvert={!!ouvert} onFermer={() => setOuvert(null)} large>
        {ouvert ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-3"><Badge ton={etatDe(ouvert.etat)?.[2]}>{ouvert.etat_libelle}</Badge><span className="text-slate-500">{ouvert.scout_nom} · {dateFR(ouvert.date_rapport)}{ouvert.match_libelle ? ` · ${ouvert.match_libelle}` : ''}</span></div>
            <p className="text-lg font-bold text-navy">{ouvert.note}/10 · {ouvert.recommandation_libelle}</p>
            <div><h3 className="font-semibold text-navy">Forces</h3><p className="whitespace-pre-line text-slate-700">{ouvert.forces}</p></div>
            <div><h3 className="font-semibold text-navy">Faiblesses</h3><p className="whitespace-pre-line text-slate-700">{ouvert.faiblesses}</p></div>
            {ouvert.commentaire_validation ? <Alerte ton="bleu">Directeur sportif : {ouvert.commentaire_validation}</Alerte> : null}
            <Alerte ton="rouge">{erreur}</Alerte>
            {a('DIRECTEUR') && ouvert.etat === 'SOUMIS' ? <Champ libelle="Commentaire (obligatoire pour un renvoi)" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /> : null}
            <div className="flex flex-wrap gap-2">
              {scout && ['BROUILLON', 'RENVOYE'].includes(ouvert.etat) ? <>
                <Bouton genre="secondaire" onClick={() => { setEdition({ id: ouvert.id, joueur: String(ouvert.joueur), forces: ouvert.forces, faiblesses: ouvert.faiblesses, note: String(ouvert.note), recommandation: ouvert.recommandation, match_observe: ouvert.match_observe ? String(ouvert.match_observe) : '' }); setRecherche(ouvert.joueur_nom); setOuvert(null); }}>Modifier</Bouton>
                <Bouton onClick={() => action(ouvert, 'soumettre')}>Soumettre</Bouton></> : null}
              {a('DIRECTEUR') && ouvert.etat === 'SOUMIS' ? <><Bouton genre="succes" onClick={() => action(ouvert, 'valider', { commentaire })}>Valider</Bouton><Bouton genre="danger" onClick={() => action(ouvert, 'renvoyer', { commentaire })}>Renvoyer</Bouton></> : null}
              {a('DIRECTEUR', 'ADMIN') && ouvert.etat === 'VALIDE' ? <Bouton genre="secondaire" onClick={() => action(ouvert, 'archiver')}>Archiver</Bouton> : null}
              <Bouton genre="secondaire" onClick={() => exporterPdf({ type: 'rapport', id: ouvert.id }).catch((e) => setErreur(e.message))}>Exporter en PDF</Bouton>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal titre={edition?.id ? 'Modifier le rapport' : 'Nouveau rapport'} ouvert={!!edition} onFermer={() => setEdition(null)} large>
        {edition ? (
          <div className="space-y-4">
            <Alerte ton="rouge">{erreur}</Alerte>
            <div className="relative">
              <Champ libelle="Joueur observé" placeholder="Rechercher un joueur…" value={recherche} onChange={(e) => { setRecherche(e.target.value); setEdition({ ...edition, joueur: '' }); }} />
              {edition.joueur ? <p className="mt-1 text-xs text-brand-green">Joueur choisi (n° {edition.joueur})</p> : null}
              {suggestions.length && !edition.joueur ? <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">{suggestions.map((j) => <li key={j.id}><button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setEdition({ ...edition, joueur: String(j.id) }); setRecherche(j.nom_complet); setSuggestions([]); }}><span>{j.nom_complet}</span><span className="text-slate-400">{j.club_nom}</span></button></li>)}</ul> : null}
            </div>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Forces</span><textarea rows={3} value={edition.forces} onChange={(e) => setEdition({ ...edition, forces: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Faiblesses</span><textarea rows={3} value={edition.faiblesses} onChange={(e) => setEdition({ ...edition, faiblesses: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <div className="grid grid-cols-2 gap-3">
              <Champ libelle="Note (0 à 10)" type="number" min={0} max={10} value={edition.note} onChange={(e) => setEdition({ ...edition, note: e.target.value })} />
              <Choix libelle="Recommandation" value={edition.recommandation} onChange={(e) => setEdition({ ...edition, recommandation: e.target.value })}>{RECO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
            </div>
            <Bouton onClick={sauver} disabled={!edition.joueur}>Enregistrer le brouillon</Bouton>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
