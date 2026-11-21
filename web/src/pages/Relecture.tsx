import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { TYPES_ACTION } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Chargement, Titre, Vide } from '../components/ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Relecture : la vidéo et les actions codées ; un clic sur une action ramène la vidéo 5 secondes avant. Les critères
// de sélection s'enregistrent en playlist (clips d'un match).
export default function Relecture() {
  const { id } = useParams();
  const video = useRef<HTMLVideoElement>(null);
  const [type, setType] = useState('');
  const [joueur, setJoueur] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const evts = useChargement<any>(() => api.get('/evenements/', { match: id, page_size: 1000 }), [id]);
  const lists = useChargement<any[]>(() => api.get('/playlists/', { match: id }).then((r: any) => (Array.isArray(r) ? r : r.results)), [id]);
  const m = match.donnees;

  const filtres = useMemo(() => {
    const t = ((evts.donnees?.results || []) as any[]).filter((e) => (!type || e.type_action === type) && (!joueur || String(e.joueur) === joueur));
    return [...t].sort((a, b) => a.temps_video - b.temps_video);
  }, [evts.donnees, type, joueur]);

  const aller = (t: number) => { if (video.current) { video.current.currentTime = Math.max(0, t - 5); video.current.play().catch(() => {}); } };
  const enregistrer = async () => {
    if (!nom.trim()) return; setErreur(null);
    try { await api.post('/playlists/', { match: Number(id), nom: nom.trim(), filtres: { type, joueur } }); setNom(''); lists.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const supprimer = async (p: any) => { try { await api.delete(`/playlists/${p.id}/`); lists.recharger(); } catch (e) { setErreur((e as Error).message); } };

  if (!m) return <Chargement />;
  return (
    <>
      <Titre titre="Relecture" sous={<>{m.domicile_nom} {m.score_domicile} – {m.score_exterieur} {m.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card titre="Vidéo">{m.video_lecture ? <video ref={video} src={m.video_lecture} controls className="w-full rounded-lg bg-black" /> : <Alerte ton="bleu">Aucune vidéo lisible pour ce match.</Alerte>}</Card>
          <Card titre="Playlists">
            <Alerte ton="rouge">{erreur}</Alerte>
            <ul className="divide-y divide-slate-100 text-sm">{(lists.donnees || []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2"><button className="flex-1 text-left font-medium text-navy hover:text-brand-blue" onClick={() => { setType(p.filtres?.type || ''); setJoueur(p.filtres?.joueur || ''); }}>{p.nom}</button>
                <span className="text-slate-400">{p.auteur_nom}</span><button aria-label="Supprimer" className="text-slate-400 hover:text-brand-red" onClick={() => supprimer(p)}>✕</button></li>))}</ul>
            {lists.donnees && !lists.donnees.length ? <Vide>Aucune playlist.</Vide> : null}
            <div className="mt-3 flex max-w-md items-end gap-3"><div className="flex-1"><Champ libelle="Enregistrer la sélection actuelle" placeholder="Nom de la playlist" value={nom} onChange={(e) => setNom(e.target.value)} /></div><Bouton onClick={enregistrer}>Enregistrer</Bouton></div>
          </Card>
        </div>
        <Card titre={`Actions (${filtres.length})`} className="lg:col-span-2">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Choix libelle="Action" value={type} onChange={(e) => setType(e.target.value)}><option value="">Toutes</option>{Object.entries(TYPES_ACTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
            <Choix libelle="Joueur" value={joueur} onChange={(e) => setJoueur(e.target.value)}><option value="">Tous</option>{m.compositions.map((c: any) => <option key={c.joueur} value={c.joueur}>{c.joueur_nom}</option>)}</Choix>
          </div>
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto text-sm">
            {filtres.map((e) => (
              <li key={e.id}><button onClick={() => aller(e.temps_video)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
                <span className="w-12 font-mono text-xs text-slate-400">{mmss(e.temps_video)}</span><span className="flex-1"><b className="text-navy">{e.type_libelle}</b> <span className="text-slate-500">{e.joueur_nom}</span></span>
                <Badge ton={e.resultat ? 'vert' : 'gris'}>{e.resultat ? 'Réussie' : 'Ratée'}</Badge></button></li>))}
          </ul>
          {!filtres.length ? <Vide>Aucune action ne correspond.</Vide> : null}
        </Card>
      </div>
    </>
  );
}
