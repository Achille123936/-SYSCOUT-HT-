import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TYPES_ACTION } from '../lib/format';
import { useChargement } from '../lib/hooks';
import DessinSvg, { FORMES, type Dessin, type Forme, type Point } from '../components/Dessins';
import VideoAnnotable from '../components/VideoAnnotable';
import ImporterVideo from '../components/ImporterVideo';
import Chronologie from '../components/Chronologie';
import CalqueSuivi, { CalqueControle, grouperParPiste, pistesALInstant, type PointPiste, type Suivi } from '../components/SuiviVideo';
import TableauCodage from '../components/TableauCodage';
import { COLONNES, COULEUR_DOMICILE, COULEUR_EXTERIEUR, LIGNES, controle, teinte } from '../lib/controle';
import { REFERENCES_M } from '../lib/homographie';
import { H, L, Terrain } from '../components/Terrain';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Chargement, Titre, Vide } from '../components/ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const REFERENCES: [string, string][] = [['TERRAIN', 'Terrain entier'], ['MOITIE', 'Moitié de terrain'], ['SURFACE', 'Surface de réparation']];
const COINS = ['haut-gauche', 'haut-droit', 'bas-droit', 'bas-gauche'];
const COULEURS = ['#22c38e', '#ffd43b', '#ff6b6b', '#4dabf7', '#ffffff'];
type Mode = 'lecture' | 'dessin' | 'calibrage' | 'suivi';

// Relecture : vidéo, actions codées, playlists ; télestration (dessins, distances en mètres, étiquettes joueur) et suivi
// d'un joueur sur la vidéo (trajet converti en mètres, comme une trace GPS). Les dessins se montrent à leur instant.
export default function Relecture() {
  const { id } = useParams();
  const { a } = useAuth();
  const video = useRef<HTMLVideoElement | null>(null);
  const [type, setType] = useState('');
  const [joueur, setJoueur] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('lecture');
  const [forme, setForme] = useState<Forme>('FLECHE');
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [texte, setTexte] = useState('');
  const [vitesse, setVitesse] = useState('');
  const [duree, setDuree] = useState('6');
  const [points, setPoints] = useState<Point[]>([]);
  const [reference, setReference] = useState('TERRAIN');
  const [coins, setCoins] = useState<Point[]>([]);
  const [suiviJoueur, setSuiviJoueur] = useState('');
  const [trace, setTrace] = useState<{ t: number; x: number; y: number }[]>([]);
  const [temps, setTemps] = useState(0);
  const [importer, setImporter] = useState(false);
  const [superposer, setSuperposer] = useState(false);
  const [liees, setLiees] = useState<string[]>([]);
  const [zones, setZones] = useState(false);
  const marques = useChargement<any[]>(() => api.get('/marques/', { match: id }).then((r: any) => (Array.isArray(r) ? r : r.results)), [id]);
  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const evts = useChargement<any>(() => api.get('/evenements/', { match: id, page_size: 1000 }), [id]);
  const lists = useChargement<any[]>(() => api.get('/playlists/', { match: id }).then((r: any) => (Array.isArray(r) ? r : r.results)), [id]);
  const dessins = useChargement<any[]>(() => api.get('/annotations/', { match: id }).then((r: any) => (Array.isArray(r) ? r : r.results)), [id]);
  const m = match.donnees;
  const analyste = a('ADMIN', 'ANALYSTE');
  const calibre = coins.length === 4;
  const pistes = useChargement<PointPiste[]>(() => (superposer ? api.get('/pistes-ia/', { match: id }).then((r: any) => (Array.isArray(r) ? r : r.results)) : null), [id, superposer]);
  const parPiste = useMemo(() => grouperParPiste(pistes.donnees || []), [pistes.donnees]);
  const nomsPistes = useMemo(() => [...parPiste.keys()], [parPiste]);
  const libellePiste = (piste: string, j: number | null) => {
    const c = m?.compositions.find((x: any) => x.joueur === j);
    return c ? `${c.numero_maillot ?? ''} ${c.joueur_nom.split(' ').pop()}`.trim() : `PISTE ${nomsPistes.indexOf(piste) + 1}`;
  };
  const couleurPiste = (s: Suivi) => (s.club === m?.club_domicile ? '#ff4d4f' : s.club === m?.club_exterieur ? '#ffffff' : '#00AAFF');
  const lier = (piste: string) => setLiees((l) => (l.includes(piste) ? l.filter((x) => x !== piste) : [...l, piste]));
  const suivis = superposer ? pistesALInstant(parPiste, temps) : [];
  // équipe d'une piste : celle proposée par le moteur, sinon celle du joueur identifié dans la composition
  const equipe = (s: Suivi) => s.club ?? m?.compositions.find((c: any) => c.joueur === s.joueur)?.club ?? null;
  // les positions des pistes sont en % du rectangle de référence : on les ramène au terrain entier
  const [refL, refH] = REFERENCES_M[reference];
  const presents = suivis.filter((s) => equipe(s) != null).map((s) => ({ x: (s.x * refL) / 105, y: (s.y * refH) / 68, domicile: equipe(s) === m?.club_domicile }));
  const cases = zones ? controle(presents) : [];
  const partDomicile = cases.length ? Math.round((100 * cases.filter((c) => c.part >= 0.5).length) / cases.length) : null;

  const filtres = useMemo(() => {
    const t = ((Array.isArray(evts.donnees) ? evts.donnees : evts.donnees?.results || []) as any[]).filter((e) => (!type || e.type_action === type) && (!joueur || String(e.joueur) === joueur));
    return [...t].sort((x, y) => x.temps_video - y.temps_video);
  }, [evts.donnees, type, joueur]);

  const aller = (t: number) => { if (video.current) { video.current.currentTime = Math.max(0, t - 5); video.current.play().catch(() => {}); } };
  const [min, max] = FORMES[forme][1];
  const mesuree = FORMES[forme][2];
  const besoinTexte = forme === 'TEXTE' || forme === 'JOUEUR';

  const enregistrerDessin = async (pts: Point[]) => {
    setErreur(null); setInfo(null);
    const corps: any = { match: Number(id), temps_video: Math.floor(video.current?.currentTime ?? 0), duree: Number(duree), forme, couleur, points: pts, texte };
    if (mesuree && calibre) { corps.coins = coins; corps.reference = reference; }
    if (forme === 'JOUEUR' && vitesse !== '') corps.vitesse = Number(vitesse);
    try { await api.post('/annotations/', corps); setPoints([]); dessins.recharger(); } catch (e) { setErreur((e as Error).message); setPoints([]); }
  };
  const surPoint = (x: number, y: number, bas: boolean) => {
    if (mode === 'calibrage') { setCoins((c) => (c.length < 4 ? [...c, [x, y]] : c)); return; }
    if (mode === 'suivi') {
      if (!suiviJoueur) return setErreur('Choisissez le joueur à suivre.');
      if (!calibre) return setErreur("Calibrez d'abord le terrain (4 coins).");
      setTrace((s) => [...s, { t: Math.round((video.current?.currentTime ?? 0) * 100) / 100, x, y }]); return;
    }
    if (mode !== 'dessin') return;
    if (besoinTexte && !texte.trim()) return setErreur('Saisissez le texte avant de cliquer sur la vidéo.');
    if (forme === 'TRAIT') { if (bas) setPoints([[x, y]]); return; }
    const suite: Point[] = [...points, [x, y]];
    if (suite.length === max && min === max) enregistrerDessin(suite); else setPoints(suite);
  };
  const surGlisser = (x: number, y: number) => { if (mode === 'dessin' && forme === 'TRAIT') setPoints((p) => [...p, [x, y]]); };
  const surFin = () => { if (mode === 'dessin' && forme === 'TRAIT' && points.length >= 2) enregistrerDessin(points); };

  const supprimer = async (d: any) => { try { await api.delete(`/annotations/${d.id}/`); dessins.recharger(); } catch (e) { setErreur((e as Error).message); } };
  const envoyerSuivi = async () => {
    setErreur(null); setInfo(null);
    try {
      const r = await api.post(`/matchs/${id}/suivi/`, { joueur: Number(suiviJoueur), reference, coins, points: trace, couleur });
      setInfo(`${r.joueur_nom} : ${Math.round(r.sequence.distance_m)} m, ${r.sequence.sprints} sprint(s), vitesse max ${String(r.sequence.vitesse_max_kmh).replace('.', ',')} km/h. Cumul du match : ${Math.round(r.cumul.distance_m)} m.${r.enregistre ? '' : ' (Un relevé GPS ou manuel existe déjà : le cumul vidéo ne le remplace pas.)'}`);
      setTrace([]); dessins.recharger();
    } catch (e) { setErreur((e as Error).message); }
  };
  const enregistrerPlaylist = async () => {
    if (!nom.trim()) return; setErreur(null);
    try { await api.post('/playlists/', { match: Number(id), nom: nom.trim(), filtres: { type, joueur } }); setNom(''); lists.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const supprimerPlaylist = async (p: any) => { try { await api.delete(`/playlists/${p.id}/`); lists.recharger(); } catch (e) { setErreur((e as Error).message); } };

  const visibles: Dessin[] = (dessins.donnees || []).filter((d) => temps >= d.temps_video && temps < d.temps_video + d.duree);
  const rendu = (taille: { l: number; h: number }) => (
    <>
      {superposer && calibre && mode === 'lecture' && zones && reference === 'TERRAIN' ? <CalqueControle cases={cases} coins={coins} reference={reference} /> : null}
      {superposer && calibre && mode === 'lecture' ? <CalqueSuivi suivis={suivis} coins={coins} reference={reference} taille={taille} liees={liees}
        etiquette={(s) => libellePiste(s.piste, s.joueur)} couleur={couleurPiste} /> : null}
      {visibles.map((d) => <DessinSvg key={d.id} d={d} taille={taille} />)}
      {mode === 'dessin' && points.length ? <DessinSvg d={{ forme, couleur, points, texte, mesures: [] }} taille={taille} provisoire /> : null}
      {(mode === 'calibrage' || mode === 'suivi') && coins.length ? <g>{coins.length >= 2 ? <polyline points={[...coins, ...(calibre ? [coins[0]] : [])].map((p) => p.join(',')).join(' ')} fill="none" stroke="#20B56B" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}{coins.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.9} fill="#20B56B" />)}</g> : null}
      {mode === 'suivi' && trace.length ? <polyline points={trace.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={couleur} strokeWidth={3} vectorEffect="non-scaling-stroke" /> : null}
      {mode === 'suivi' && trace.length ? <circle cx={trace[trace.length - 1].x} cy={trace[trace.length - 1].y} r={1.2} fill={couleur} stroke="#fff" strokeWidth={0.3} /> : null}
    </>
  );

  if (!m) return <Chargement />;
  const aide = mode === 'calibrage' ? `Calibrage : cliquez le coin ${COINS[coins.length] || '(terminé)'} du rectangle de référence.`
    : mode === 'suivi' ? 'Suivi : mettez la vidéo en pause, cliquez sur le joueur, avancez de 1 s, cliquez à nouveau (2 secondes minimum).'
    : mode === 'dessin' ? (forme === 'TRAIT' ? 'Maintenez le bouton et dessinez.' : `Cliquez ${min === max ? `${min} point(s)` : `de ${min} à ${max} points puis « Terminer »`}.`) : undefined;

  return (
    <>
      <Titre titre="Relecture" sous={<>{m.domicile_nom} {m.score_domicile} – {m.score_exterieur} {m.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></>} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card titre="Vidéo">
            <div className="mb-3 space-y-2"><Alerte ton="rouge">{erreur}</Alerte><Alerte ton="vert">{info}</Alerte></div>
            {!m.video_lecture && analyste && ['PLANIFIE', 'VIDEO_IMPORTEE'].includes(m.etat) ? <div className="mb-3"><Bouton onClick={() => setImporter(true)}>Importer une vidéo</Bouton><ImporterVideo ouvert={importer} onFermer={() => setImporter(false)} matchId={m.id} onFait={() => match.recharger()} /></div> : null}
            <VideoAnnotable src={m.video_lecture || undefined} refVideo={video} onTemps={setTemps} capture={mode !== 'lecture'} onPoint={surPoint} onGlisser={surGlisser} onFin={surFin} rendu={rendu} aide={aide} />
            {analyste && m.video_lecture ? (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={superposer} onChange={(e) => setSuperposer(e.target.checked)} /> Superposer le suivi automatique des joueurs</label>
                {superposer ? (<>
                  <Alerte ton="orange">Données du moteur IA, non vérifiées. Le terrain doit être calibré sur cette vidéo, avec la même référence que la caméra.</Alerte>
                  {!calibre ? <Alerte ton="bleu">Calibrez d'abord le terrain (bouton « Calibrer le terrain », 4 coins), puis revenez en « Lecture ».</Alerte> : null}
                  {pistes.erreur ? <Alerte ton="rouge">{pistes.erreur}</Alerte> : null}
                  {pistes.donnees && !pistes.donnees.length ? <p className="text-slate-500">Le moteur IA n'a envoyé aucune piste pour ce match.</p> : null}
                  {nomsPistes.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-slate-500">Relier (distances en mètres) :</span>
                    {nomsPistes.map((p) => <button key={p} onClick={() => lier(p)} aria-pressed={liees.includes(p)} className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${liees.includes(p) ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300'}`}>{libellePiste(p, parPiste.get(p)![0].joueur)}</button>)}
                    {liees.length ? <button className="text-xs text-brand-blue hover:underline" onClick={() => setLiees([])}>Tout délier</button> : null}</div> : null}
                  <label className="flex items-center gap-2"><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> Afficher le contrôle de l'espace (sur la vidéo avec la référence « Terrain entier », et sur la vue 2D)</label>
                </>) : null}
              </div>) : null}
            {analyste && m.video_lecture ? (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap gap-2">
                  {([['lecture', 'Lecture'], ['dessin', 'Dessiner'], ['calibrage', 'Calibrer le terrain'], ['suivi', 'Suivre un joueur']] as [Mode, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => { setMode(v); setPoints([]); setErreur(null); }} className={`rounded-full border px-3 py-1 text-sm font-medium ${mode === v ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 text-slate-700'}`}>{l}</button>))}
                  <span className="ml-auto text-xs text-slate-500">{calibre ? `Terrain calibré (${reference})` : 'Terrain non calibré : pas de distances en mètres'}</span>
                </div>
                {(mode === 'calibrage' || mode === 'suivi') ? (
                  <div className="flex flex-wrap items-end gap-3"><div className="w-56"><Choix libelle="Rectangle de référence" value={reference} onChange={(e) => setReference(e.target.value)}>{REFERENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix></div>
                    {mode === 'calibrage' ? <Bouton genre="secondaire" onClick={() => setCoins([])}>Recommencer les coins</Bouton> : null}</div>) : null}
                {mode === 'dessin' ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">{(Object.keys(FORMES) as Forme[]).map((f) => <button key={f} onClick={() => { setForme(f); setPoints([]); }} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${forme === f ? 'border-navy bg-navy text-white' : 'border-slate-300 text-slate-700'}`}>{FORMES[f][0]}</button>)}</div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex gap-1.5">{COULEURS.map((c) => <button key={c} aria-label={`Couleur ${c}`} onClick={() => setCouleur(c)} className={`h-7 w-7 rounded-full border-2 ${couleur === c ? 'border-navy' : 'border-slate-300'}`} style={{ background: c }} />)}</div>
                      <div className="w-24"><Choix libelle="Durée" value={duree} onChange={(e) => setDuree(e.target.value)}>{[3, 6, 10, 20, 30].map((d) => <option key={d} value={d}>{d} s</option>)}</Choix></div>
                      {besoinTexte ? <div className="w-48"><Champ libelle={forme === 'JOUEUR' ? 'Nom ou numéro' : 'Texte'} value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={60} /></div> : null}
                      {forme === 'JOUEUR' ? <div className="w-28"><Champ libelle="Vitesse (km/h)" type="number" min={0} max={45} value={vitesse} onChange={(e) => setVitesse(e.target.value)} /></div> : null}
                      {min !== max && forme !== 'TRAIT' ? <Bouton onClick={() => enregistrerDessin(points)} disabled={points.length < min}>Terminer ({points.length})</Bouton> : null}
                      {points.length ? <Bouton genre="secondaire" onClick={() => setPoints([])}>Annuler le dessin</Bouton> : null}
                    </div>
                    {mesuree && !calibre ? <Alerte ton="bleu">Pour afficher des mètres, calibrez d'abord le terrain (mode « Calibrer »).</Alerte> : null}
                  </div>) : null}
                {mode === 'suivi' ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-60"><Choix libelle="Joueur suivi" value={suiviJoueur} onChange={(e) => setSuiviJoueur(e.target.value)}><option value="">— choisir —</option>{m.compositions.map((c: any) => <option key={c.joueur} value={c.joueur}>{c.joueur_nom}</option>)}</Choix></div>
                    <Bouton onClick={envoyerSuivi} disabled={trace.length < 2 || !suiviJoueur || !calibre}>Enregistrer le suivi ({trace.length} points)</Bouton>
                    {trace.length ? <Bouton genre="secondaire" onClick={() => setTrace([])}>Effacer</Bouton> : null}
                  </div>) : null}
              </div>) : null}
          </Card>
          {superposer ? (
            <Card titre="Vue tactique 2D" droite={partDomicile != null ? <span className="text-xs font-bold"><span style={{ color: COULEUR_DOMICILE }}>{m.domicile_nom} {partDomicile} %</span> · <span style={{ color: COULEUR_EXTERIEUR }}>{100 - partDomicile} % {m.exterieur_nom}</span></span> : undefined}>
              <Terrain derriere={<>{cases.map((c) => <rect key={`${c.i}-${c.j}`} x={c.i * (L / COLONNES)} y={c.j * (H / LIGNES)} width={L / COLONNES} height={H / LIGNES} {...teinte(c.part)} />)}</>}>
                {suivis.map((s) => { const x = ((s.x * refL) / 105 / 100) * L, y = ((s.y * refH) / 68 / 100) * H, e = equipe(s); return (
                  <g key={s.piste} onClick={() => lier(s.piste)} style={{ cursor: 'pointer' }}><title>{libellePiste(s.piste, s.joueur)}</title>
                    <circle cx={x} cy={y} r={2} fill={e == null ? '#00AAFF' : e === m.club_domicile ? COULEUR_DOMICILE : COULEUR_EXTERIEUR} stroke="#fff" strokeWidth={liees.includes(s.piste) ? 0.9 : 0.35} />
                    <text x={x} y={y + 0.8} fontSize={2.2} fontWeight="bold" textAnchor="middle" fill="#fff">{m.compositions.find((c: any) => c.joueur === s.joueur)?.numero_maillot ?? nomsPistes.indexOf(s.piste) + 1}</text></g>); })}
              </Terrain>
              <p className="mt-2 text-xs text-slate-500">Positions du moteur IA à l'instant de la vidéo (non vérifiées).{zones ? (cases.length ? " Contrôle de l'espace : estimation par la seule distance des joueurs suivis, sans vitesse ni ballon." : " Contrôle de l'espace indisponible : il faut des joueurs des deux équipes, identifiés ou classés.") : ''}</p>
            </Card>
          ) : null}
          <Card titre="Tableau de codage">
            <TableauCodage matchId={Number(id)} video={video} marques={marques} peutCoder={analyste} />
          </Card>
          <Card titre="Chronologie">
            <Chronologie actions={filtres} marques={marques.donnees || []} video={video} temps={temps} aller={aller} />
          </Card>
          <Card titre="Carte des actions">
            <Terrain>
              {filtres.slice(0, 600).map((e) => (
                <g key={e.id} onClick={() => aller(e.temps_video)} style={{ cursor: 'pointer' }}>
                  <title>{`${mmss(e.temps_video)} · ${e.type_libelle} · ${e.joueur_nom}`}</title>
                  {e.fin_x != null ? <><line x1={(e.zone_x / 100) * L} y1={(e.zone_y / 100) * H} x2={(e.fin_x / 100) * L} y2={(e.fin_y / 100) * H} stroke={e.resultat ? '#F5D90A' : '#E5484D'} strokeWidth={0.35} strokeOpacity={0.8} />
                    <circle cx={(e.fin_x / 100) * L} cy={(e.fin_y / 100) * H} r={0.7} fill={e.resultat ? '#F5D90A' : '#E5484D'} /></> : null}
                  <circle cx={(e.zone_x / 100) * L} cy={(e.zone_y / 100) * H} r={0.9} fill="#00AAFF" fillOpacity={0.85} />
                </g>
              ))}
            </Terrain>
            <p className="mt-2 text-xs text-slate-500">Chaque équipe attaque vers la droite. Les passes et centres dont l'arrivée est codée sont tracés (jaune : réussis, rouge : ratés). Un clic lit l'action.{filtres.length > 600 ? ` Les 600 premières des ${filtres.length} actions sont affichées : filtrez par action ou par joueur.` : ''}</p>
          </Card>
          <Card titre={`Dessins (${(dessins.donnees || []).length})`}>
            {dessins.donnees?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">{[...dessins.donnees].sort((x, y) => x.temps_video - y.temps_video).map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2"><button className="font-mono text-xs text-brand-blue hover:underline" onClick={() => { if (video.current) { video.current.currentTime = d.temps_video; } }}>{mmss(d.temps_video)}</button>
                  <span className="h-3 w-3 rounded-full" style={{ background: d.couleur }} /><span className="flex-1">{FORMES[d.forme as Forme]?.[0] || d.forme}{d.texte ? ` · ${d.texte}` : ''}{d.mesures?.length && d.forme !== 'JOUEUR' ? ` · ${d.mesures.map((x: number) => `${String(x).replace('.', ',')} m`).join(' / ')}` : ''}</span><span className="text-slate-400">{d.auteur_nom}</span>
                  {analyste ? <button aria-label="Supprimer le dessin" className="text-slate-400 hover:text-brand-red" onClick={() => supprimer(d)}>✕</button> : null}</li>))}</ul>
            ) : <Vide>Aucun dessin sur cette vidéo.</Vide>}
          </Card>
          <Card titre="Playlists">
            <ul className="divide-y divide-slate-100 text-sm">{(lists.donnees || []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2"><button className="flex-1 text-left font-medium text-navy hover:text-brand-blue" onClick={() => { setType(p.filtres?.type || ''); setJoueur(p.filtres?.joueur || ''); }}>{p.nom}</button>
                <span className="text-slate-400">{p.auteur_nom}</span><button aria-label="Supprimer" className="text-slate-400 hover:text-brand-red" onClick={() => supprimerPlaylist(p)}>✕</button></li>))}</ul>
            {lists.donnees && !lists.donnees.length ? <Vide>Aucune playlist.</Vide> : null}
            <div className="mt-3 flex max-w-md items-end gap-3"><div className="flex-1"><Champ libelle="Enregistrer la sélection actuelle" placeholder="Nom de la playlist" value={nom} onChange={(e) => setNom(e.target.value)} /></div><Bouton onClick={enregistrerPlaylist}>Enregistrer</Bouton></div>
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
