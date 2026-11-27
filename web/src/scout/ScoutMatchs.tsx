import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import ImporterVideo from '../components/ImporterVideo';
import { TYPES_ACTION, dateFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import VideoAnnotable from '../components/VideoAnnotable';
import { BoutonAzur, Lecture, Numero, Panneau } from './ScoutUI';
import { CATEGORIES } from './categories';

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const TAILLE_MOMENTS = 8, AVANT = 5, APRES = 4; // secondes lues autour d'une action
const ONGLETS = [['match', 'Match'], ['buts', 'Buts'], ['forts', 'Moments forts'], ['records', 'Mes listes']] as const;
type Onglet = (typeof ONGLETS)[number][0];

// Interface 2 — centre vidéo : liste des matchs à gauche ; à droite la vidéo, le score en surimpression et les moments
// du match (buts, moments forts, listes enregistrées). Un clic sur un moment ramène la vidéo 5 secondes avant.
export default function ScoutMatchs() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const joueur = params.get('joueur') || '', club = params.get('club') || '', type = params.get('type') || '';
  const choisi = params.get('match');
  const video = useRef<HTMLVideoElement | null>(null);
  const [page, setPage] = useState(1);
  const [liste, setListe] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [filtres, setFiltres] = useState(false);
  const [competition, setCompetition] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('match');
  const [pageMoments, setPageMoments] = useState(1);
  const [temps, setTemps] = useState(0);
  const [nom, setNom] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { a } = useAuth();
  const [importer, setImporter] = useState(false);
  const [vue, setVue] = useState<'matchs' | 'actions'>('matchs');
  const [categorie, setCategorie] = useState('');
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [actif, setActif] = useState<number | null>(null);
  const [file, setFile] = useState<any[]>([]);   // actions du rapport vidéo en cours de lecture
  const [rang, setRang] = useState(0);
  const arrive = useRef(false);                   // la vidéo a atteint le passage demandé
  const [angle, setAngle] = useState(1);
  const reprise = useRef(0);

  const competitions = useChargement<any[]>(() => api.tout('/competitions/'), []);
  const matchs = useChargement<Page<any>>(() => api.get('/matchs/', { joueur, club, competition, page, page_size: 50 }), [joueur, club, competition, page]);
  useEffect(() => { setPage(1); setListe([]); }, [joueur, club, competition]);
  useEffect(() => { if (matchs.donnees) { setTotal(matchs.donnees.count); setListe((l) => (page === 1 ? matchs.donnees!.results : [...l, ...matchs.donnees!.results])); } }, [matchs.donnees, page]);

  const lisibles = liste.filter((m) => m.video_lecture);
  const idCourant = choisi || (lisibles[0] ? String(lisibles[0].id) : '');
  const match = useChargement<any>(() => (idCourant ? api.get(`/matchs/${idCourant}/`) : null), [idCourant]);
  const evts = useChargement<any>(() => (idCourant ? api.get('/evenements/', { match: idCourant, page_size: 1000 }) : null), [idCourant]);
  const listes = useChargement<any[]>(() => (idCourant ? api.get('/playlists/', { match: idCourant }).then((r: any) => (Array.isArray(r) ? r : r.results)) : null), [idCourant]);
  const m = match.donnees;
  useEffect(() => { setPageMoments(1); }, [idCourant, onglet, type, joueur, categorie]);
  useEffect(() => { setSelection(new Set()); setFile([]); setActif(null); setAngle(1); }, [idCourant]);
  useEffect(() => { setFile([]); }, [categorie, onglet]);

  const tous: any[] = useMemo(() => [...(Array.isArray(evts.donnees) ? evts.donnees : evts.donnees?.results || [])].sort((a, b) => a.temps_video - b.temps_video), [evts.donnees]);
  const buts = tous.filter((e) => e.type_action === 'BUT');
  const moments = useMemo(() => {
    let l = tous;
    const choix = CATEGORIES.find((c) => c.id === categorie);
    if (choix) l = tous.filter((e) => choix.filtre(e, tous));
    else if (onglet === 'buts') l = buts;
    else if (onglet === 'forts') l = tous.filter((e) => ['BUT', 'TIR', 'DRIBBLE', 'CARTON'].includes(e.type_action) && (e.type_action !== 'DRIBBLE' || e.resultat));
    if (type) l = l.filter((e) => e.type_action === type);
    if (joueur) l = l.filter((e) => String(e.joueur) === joueur);
    return l;
  }, [tous, buts, onglet, type, joueur, categorie]);
  const comptes = useMemo(() => {
    const base = joueur ? tous.filter((e) => String(e.joueur) === joueur) : tous;
    return Object.fromEntries(CATEGORIES.map((c) => [c.id, base.filter((e) => c.filtre(e, tous)).length]));
  }, [tous, joueur]);
  const pages = Math.max(1, Math.ceil(moments.length / TAILLE_MOMENTS));
  const visibles = moments.slice((pageMoments - 1) * TAILLE_MOMENTS, pageMoments * TAILLE_MOMENTS);

  const score = useMemo(() => {
    if (!m) return [0, 0];
    const avant = buts.filter((e) => e.temps_video <= temps);
    return [avant.filter((e) => e.club === m.club_domicile).length, avant.filter((e) => e.club === m.club_exterieur).length];
  }, [buts, m, temps]);

  const aller = (t: number) => { if (video.current) { video.current.currentTime = Math.max(0, t - AVANT); video.current.play().catch(() => {}); } };
  const sauter = (e: any) => { setFile([]); setActif(e.id); aller(e.temps_video); };
  const voisin = (pas: 1 | -1) => {
    const i = moments.findIndex((e) => e.id === actif);
    const j = i < 0 ? 0 : i + pas;
    if (!moments[j]) return;
    sauter(moments[j]); setPageMoments(Math.floor(j / TAILLE_MOMENTS) + 1);
  };
  const choisies = selection.size ? moments.filter((e) => selection.has(e.id)) : moments;
  const lireRapport = () => { if (!choisies.length) return; arrive.current = false; setFile(choisies); setRang(0); setActif(choisies[0].id); aller(choisies[0].temps_video); };
  useEffect(() => { // enchaîne les actions du rapport vidéo
    const e = file[rang];
    if (!e) return;
    if (!arrive.current) { arrive.current = temps >= e.temps_video - AVANT - 1 && temps < e.temps_video + APRES; return; }
    if (temps < e.temps_video + APRES) return;
    const suivante = file[rang + 1];
    if (!suivante) { video.current?.pause(); setFile([]); return; }
    arrive.current = false; setRang(rang + 1); setActif(suivante.id); aller(suivante.temps_video);
  }, [temps]); // eslint-disable-line react-hooks/exhaustive-deps
  const cocher = (id: number) => setSelection((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const changerAngle = (n: number) => { reprise.current = video.current?.currentTime || 0; setFile([]); setAngle(n); };
  useEffect(() => { // reprend au même instant après un changement d'angle
    const v = video.current; if (!v || !reprise.current) return;
    const f = () => { v.currentTime = reprise.current; v.play().catch(() => {}); };
    v.addEventListener('loadedmetadata', f, { once: true });
    return () => v.removeEventListener('loadedmetadata', f);
  }, [angle]);
  const instant = Number(params.get('t')) || 0;
  useEffect(() => { // lien partagé : ?match=…&t=secondes
    const v = video.current; if (!v || !instant) return;
    const f = () => { v.currentTime = instant; };
    if (v.readyState >= 1) f(); else v.addEventListener('loadedmetadata', f, { once: true });
    return () => v.removeEventListener('loadedmetadata', f);
  }, [match.donnees?.id, instant]);
  const partager = async () => {
    const u = new URL(window.location.href); u.searchParams.set('match', idCourant); u.searchParams.set('t', String(Math.floor(temps)));
    try { await navigator.clipboard.writeText(u.toString()); setMessage('Lien copié (il demande une connexion).'); } catch { setMessage(u.toString()); }
  };
  const mi = (moitie: number) => { const d = video.current?.duration; if (video.current && d) video.current.currentTime = moitie === 0 ? 0 : d / 2; };
  const capture = () => {
    const v = video.current; if (!v) return;
    try {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d')!.drawImage(v, 0, 0);
      const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `match-${idCourant}-${mmss(v.currentTime).replace(':', 'm')}.png`; a.click();
      setMessage(null);
    } catch { setMessage("La capture est bloquée : la vidéo vient d'un autre site qui ne l'autorise pas."); }
  };
  const exporter = () => {
    const lignes = [['minute', 'temps_video', 'action', 'joueur', 'resultat'], ...choisies.map((e) => [e.minute, mmss(e.temps_video), TYPES_ACTION[e.type_action] || e.type_action, e.joueur_nom, e.resultat ? 'réussie' : 'ratée'])];
    const csv = lignes.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `moments-match-${idCourant}.csv`; a.click();
  };
  const enregistrer = async () => {
    if (!nom.trim()) return;
    try { await api.post('/playlists/', { match: Number(idCourant), nom: nom.trim(), filtres: { type, joueur, categorie } }); setNom(''); listes.recharger(); } catch (e) { setMessage((e as Error).message); }
  };
  const choisir = (id: number) => { const p = new URLSearchParams(params); p.set('match', String(id)); setParams(p); };
  const retirerFiltre = (cle: string) => { const p = new URLSearchParams(params); p.delete(cle); setParams(p); };

  const titre = m ? `${m.domicile_nom} - ${m.exterieur_nom}, ${m.score_domicile}-${m.score_exterieur}` : '';
  const sousTitre = (e: any) => `${mmss(e.temps_video)} - ${m.domicile_nom} - ${m.exterieur_nom}, ${m.score_domicile}-${m.score_exterieur} - ${dateFR(m.date_match)}`;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex items-center gap-3 border-b border-wy-bord bg-white px-4 py-2">
        <button onClick={() => navigate(-1)} className="px-1 text-lg text-wy-doux hover:text-wy-bleu" aria-label="Retour">‹</button>
        <h1 className="text-[16px] font-bold uppercase">Matchs complets</h1>
        {club ? <Link to={`/scout/equipe/${club}`} className="text-[13px] text-wy-bleu hover:underline">équipe #{club}</Link> : null}
        {joueur ? <Link to={`/scout/joueur/${joueur}`} className="text-[13px] text-wy-bleu hover:underline">joueur #{joueur}</Link> : null}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panneau titre={vue === 'matchs' ? 'Liste des matchs' : 'Liste des actions'} droite={<span className="flex flex-wrap justify-end gap-2">
          <BoutonAzur onClick={() => setVue(vue === 'matchs' ? 'actions' : 'matchs')}>{vue === 'matchs' ? 'Actions' : 'Matchs'}</BoutonAzur>
          {vue === 'matchs' && a('ADMIN', 'ANALYSTE') ? <BoutonAzur onClick={() => setImporter(true)}>Importer une vidéo</BoutonAzur> : null}
          {vue === 'matchs' ? <BoutonAzur onClick={() => setFiltres(!filtres)}>Filtres</BoutonAzur> : null}</span>}>
          {vue === 'actions' ? (
            <ul className="grid grid-cols-2 gap-x-2 border-t border-wy-bord pt-2">
              {CATEGORIES.map((c) => (
                <li key={c.id}><button onClick={() => { setCategorie(categorie === c.id ? '' : c.id); setOnglet('match'); }} aria-pressed={categorie === c.id} title={c.aide}
                  className={`flex w-full items-center gap-2.5 px-2 py-2 text-left text-[13px] ${categorie === c.id ? 'bg-wy-fond font-bold' : 'hover:bg-wy-fond'} ${comptes[c.id] ? '' : 'opacity-50'}`}>
                  <Lecture taille={24} /><span className="min-w-0 flex-1">{c.libelle}</span><span className="text-[11px] text-wy-doux">{comptes[c.id]}</span></button></li>
              ))}
            </ul>
          ) : (<>
          {filtres ? (
            <div className="mb-3 flex flex-wrap items-center gap-3 border border-wy-bord bg-wy-fond p-2 text-[12px]">
              <label className="flex items-center gap-2">Compétition
                <select value={competition} onChange={(e) => setCompetition(e.target.value)} className="border border-wy-bord bg-white px-2 py-1"><option value="">Toutes</option>{(competitions.donnees || []).map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.saison_libelle}</option>)}</select></label>
              {type ? <button onClick={() => retirerFiltre('type')} className="rounded-full bg-wy-azur px-2 py-0.5 text-white">Action : {TYPES_ACTION[type] || type} ✕</button> : null}
              {joueur ? <button onClick={() => retirerFiltre('joueur')} className="rounded-full bg-wy-azur px-2 py-0.5 text-white">Joueur #{joueur} ✕</button> : null}
            </div>
          ) : null}
          <ul className="max-h-[640px] overflow-y-auto border-t border-wy-bord">
            {lisibles.map((x) => (
              <li key={x.id}><button onClick={() => choisir(x.id)} className={`flex w-full items-center gap-3 border-b border-wy-bord px-2 py-2.5 text-left ${String(x.id) === idCourant ? 'bg-wy-fond' : 'hover:bg-slate-50'}`}>
                <Lecture />
                <span className="min-w-0"><span className="block truncate text-[14px]">{x.domicile_nom} {x.score_domicile} - {x.score_exterieur} {x.exterieur_nom}</span>
                  <span className="block truncate text-[12px] text-wy-bleu">{dateFR(x.date_match)} - {x.competition_nom} - Journée {x.journee}</span></span>
                {x.etat === 'EN_CODAGE' ? <span className="ml-auto rounded bg-red-50 px-1.5 text-[10px] font-bold text-red-600">DIRECT</span> : null}
              </button></li>
            ))}
            {!lisibles.length ? <li className="p-4 text-[13px] text-wy-doux">{matchs.enCours ? 'Chargement…' : 'Aucun match avec vidéo pour ces critères.'}</li> : null}
          </ul>
          <div className="mt-3 flex items-center justify-between text-[12px] text-wy-doux"><span>{lisibles.length} sur {total} match(s)</span>
            {liste.length < total ? <BoutonAzur onClick={() => setPage(page + 1)}>Matchs suivants ›</BoutonAzur> : null}</div>
          </>)}
        </Panneau>

        <ImporterVideo ouvert={importer} onFermer={() => setImporter(false)} onFait={(mt) => { setPage(1); matchs.recharger(); choisir(mt.id); }} />
        <section className="min-w-0 border border-wy-bord bg-white">
          <header className="flex items-center justify-between gap-3 px-4 py-2.5">
            <h2 className="truncate text-[14px] font-bold uppercase">{titre || 'Choisissez un match'}</h2>
            <BoutonAzur onClick={capture} disabled={!m}>Capture d'écran</BoutonAzur>
          </header>
          <div className="px-4 pb-3">
            {m ? (
              <VideoAnnotable src={(angle === 2 && m.video_url_2) || m.video_lecture || undefined} refVideo={video} onTemps={setTemps}
                habillage={(
                  <div className="flex items-center overflow-hidden rounded-sm bg-black/80 text-[13px] font-bold text-white">
                    <span className="px-2.5 py-1">{(m.domicile_sigle || m.domicile_nom.slice(0, 3)).toUpperCase()}</span>
                    <span className="bg-wy-azur px-2.5 py-1">{score[0]} - {score[1]}</span>
                    <span className="px-2.5 py-1">{(m.exterieur_sigle || m.exterieur_nom.slice(0, 3)).toUpperCase()}</span>
                  </div>
                )}
                />
            ) : <div className="grid h-72 place-items-center bg-black text-[13px] text-white/60">{match.enCours ? 'Chargement…' : 'Aucune vidéo'}</div>}
            {m ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BoutonAzur onClick={() => voisin(-1)} disabled={!moments.length}>⏮ Action précédente</BoutonAzur>
                <BoutonAzur onClick={() => voisin(1)} disabled={!moments.length}>Action suivante ⏭</BoutonAzur>
                {file.length ? <BoutonAzur onClick={() => { setFile([]); video.current?.pause(); }}>Arrêter ({rang + 1}/{file.length})</BoutonAzur>
                  : <BoutonAzur onClick={lireRapport} disabled={!choisies.length}>▶ Rapport vidéo ({choisies.length})</BoutonAzur>}
                {m.video_url_2 ? <BoutonAzur onClick={() => changerAngle(angle === 1 ? 2 : 1)}>Angle {angle === 1 ? 2 : 1}</BoutonAzur> : null}
                <BoutonAzur onClick={partager}>Partager</BoutonAzur>
              </div>
            ) : null}
            {message ? <p role="status" className="mt-2 break-all text-[12px] text-wy-orange">{message}</p> : null}
          </div>

          <div className="border-t border-wy-bord">
            <div className="flex items-center gap-4 px-4 py-2 text-[12px] font-semibold"><span>▣ Infos du match</span><span className="flex items-center gap-1.5 text-red-600"><span className="h-2 w-2 rounded-full bg-red-600" />REC</span>
              {(type || joueur || categorie) ? <span className="ml-auto font-normal text-wy-doux">filtre : {CATEGORIES.find((c) => c.id === categorie)?.libelle} {type ? TYPES_ACTION[type] || type : ''} {joueur ? `· joueur #${joueur}` : ''}</span> : null}
              {categorie ? <button className="font-normal text-wy-bleu" onClick={() => setCategorie('')}>Retirer ✕</button> : null}</div>
            {onglet === 'match' && !type && !joueur && !categorie ? (
              <ul className="text-[13px]">
                {[['Avant-match', 0, 'Début de la vidéo'], ['Première mi-temps', 0, 'Du coup d\'envoi à la pause'], ['Deuxième mi-temps', 1, 'De la reprise au coup de sifflet final']].map(([n, k, d], i) => (
                  <li key={String(n)}><button onClick={() => mi(i === 2 ? 1 : 0)} className={`flex w-full items-center gap-3 border-t border-wy-bord px-4 py-2 text-left hover:bg-wy-fond ${i === 1 ? 'bg-wy-fond' : ''}`}>
                    <Numero n={i + 1} /><span><span className="block">{n as string}</span><span className="block text-[11px] text-wy-bleu">{m ? `${dateFR(m.date_match)} - ${m.domicile_nom} - ${m.exterieur_nom}` : d as string}</span></span></button></li>
                ))}
              </ul>
            ) : null}
            {onglet !== 'records' ? (
              <ul className="text-[13px]">
                {visibles.map((e, i) => (
                  <li key={e.id} className={`flex items-center border-t border-wy-bord pr-4 ${actif === e.id ? 'bg-wy-fond' : ''}`}><button onClick={() => sauter(e)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left hover:bg-wy-fond">
                    <Numero n={(pageMoments - 1) * TAILLE_MOMENTS + i + 1} />
                    <span className="min-w-0"><span className="block truncate">({TYPES_ACTION[e.type_action] || e.type_action}) {e.joueur_nom}{!e.resultat ? ' · ratée' : ''}</span><span className="block truncate text-[11px] text-wy-bleu">{sousTitre(e)}</span></span></button>
                    <input type="checkbox" checked={selection.has(e.id)} onChange={() => cocher(e.id)} aria-label={`Sélectionner l'action de ${e.joueur_nom} à ${mmss(e.temps_video)}`} /></li>
                ))}
                {!visibles.length ? <li className="border-t border-wy-bord px-4 py-4 text-[13px] text-wy-doux">{evts.enCours ? 'Chargement…' : 'Aucun moment pour ce match.'}</li> : null}
              </ul>
            ) : (
              <div className="border-t border-wy-bord px-4 py-3">
                <ul className="divide-y divide-wy-bord text-[13px]">{(listes.donnees || []).map((p) => (
                  <li key={p.id}><button className="w-full py-2 text-left hover:text-wy-bleu" onClick={() => { const q = new URLSearchParams(params); p.filtres?.type ? q.set('type', p.filtres.type) : q.delete('type'); p.filtres?.joueur ? q.set('joueur', p.filtres.joueur) : q.delete('joueur'); setParams(q); setCategorie(p.filtres?.categorie || ''); setOnglet('match'); }}>{p.nom} <span className="text-wy-doux">· {p.auteur_nom}</span></button></li>))}</ul>
                {listes.donnees && !listes.donnees.length ? <p className="text-[13px] text-wy-doux">Aucune liste. Filtrez les moments, puis enregistrez la sélection.</p> : null}
                <div className="mt-3 flex max-w-sm gap-2"><input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la liste" className="flex-1 border border-wy-bord px-2 py-1 text-[13px]" /><BoutonAzur onClick={enregistrer}>Enregistrer</BoutonAzur></div>
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-wy-bord px-4 py-2.5 text-[12px]">
            <nav className="flex gap-4" aria-label="Moments du match">
              {ONGLETS.map(([id, l]) => <button key={id} onClick={() => { setOnglet(id); setCategorie(''); }} className={`font-semibold ${onglet === id ? 'text-wy-azur' : 'text-wy-texte hover:text-wy-bleu'}`}>{l}</button>)}
            </nav>
            <div className="flex items-center gap-3">
              {onglet !== 'records' ? <span className="text-wy-doux">{pageMoments}/{pages}</span> : null}
              {onglet !== 'records' && pageMoments < pages ? <BoutonAzur onClick={() => setPageMoments(pageMoments + 1)}>Page suivante ›</BoutonAzur> : null}
              <BoutonAzur onClick={exporter} disabled={!moments.length}>Exporter</BoutonAzur>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
