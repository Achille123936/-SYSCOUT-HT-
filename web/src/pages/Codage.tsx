import { useCallback, useRef, useState } from 'react';
import { estHls, useHls } from '../lib/hls';
import { Link, useParams } from 'react-router-dom';
import { ErreurApi, api, nouvelleCle } from '../lib/api';
import { QUALIFICATIFS, TYPES_ACTION } from '../lib/format';
import { useChargement, useIntervalle } from '../lib/hooks';
import { H, L, Terrain } from '../components/Terrain';
import { Alerte, Badge, Bouton, Card, Chargement, Titre } from '../components/ui';

const PARTIES: [string, string][] = [['PIED_D', 'Pied droit'], ['PIED_G', 'Pied gauche'], ['TETE', 'Tête'], ['AUTRE', 'Autre']];
const AVEC_ARRIVEE = ['PASSE', 'CENTRE'];
const SANS_TERRAIN = ['REMPLACEMENT']; // le lieu n'a pas de sens pour un changement de joueur

interface Saisie { cle_idempotence: string; match: number; joueur: number; joueur_lie?: number; type_action: string; minute: number; temps_video: number; zone_x: number; zone_y: number; fin_x?: number; fin_y?: number; resultat: boolean; partie_corps?: string; qualificatifs?: string[] }
const fileLocale = (id: string | undefined) => `syscout.codage.${id}`;
const lire = (id: string | undefined): Saisie[] => { try { return JSON.parse(localStorage.getItem(fileLocale(id)) || '[]'); } catch { return []; } };
const ecrire = (id: string | undefined, v: Saisie[]) => { try { localStorage.setItem(fileLocale(id), JSON.stringify(v)); } catch { /* quota */ } };

// CU07 : codage vidéo. Le match est verrouillé pour l'analyste ; chaque action part avec une clé d'idempotence, et les
// saisies qui n'ont pas pu partir (coupure réseau) restent sur l'appareil puis sont renvoyées sans doublon (NFR-008).
export default function Codage() {
  const { id } = useParams();
  const video = useRef<HTMLVideoElement>(null);
  const [club, setClub] = useState<'domicile' | 'exterieur'>('domicile');
  const [joueur, setJoueur] = useState<number | null>(null);
  const [sortant, setSortant] = useState<number | null>(null);
  const [type, setType] = useState('PASSE');
  const [reussie, setReussie] = useState(true);
  const [partie, setPartie] = useState('PIED_D');
  const [details, setDetails] = useState<string[]>([]);
  const [depart, setDepart] = useState<[number, number] | null>(null);
  const [arrivee, setArrivee] = useState<[number, number] | null>(null);
  const [minuteManuelle, setMinuteManuelle] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verrouOk, setVerrouOk] = useState(false);
  const [attente, setAttente] = useState<Saisie[]>(() => lire(id));
  const [validation, setValidation] = useState<string[] | null>(null);

  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const evts = useChargement<any>(() => api.get('/evenements/', { match: id, page_size: 1000 }), [id]);
  const m = match.donnees;
  useHls(video, m?.video_lecture);
  const compo: any[] = (m?.compositions || []).filter((c: any) => c.club === (club === 'domicile' ? m?.club_domicile : m?.club_exterieur));

  const ouvrir = useCallback(async () => {
    try { await api.post(`/matchs/${id}/ouvrir-codage/`); setVerrouOk(true); setErreur(null); match.recharger(); }
    catch (e) { setVerrouOk(false); setErreur((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useIntervalle(() => { if (verrouOk) api.post(`/matchs/${id}/ouvrir-codage/`).catch(() => setVerrouOk(false)); }, 30000); // renouvelle le verrou

  // renvoi des saisies restées sur l'appareil
  const vider = useCallback(async () => {
    const file = lire(id);
    if (!file.length) return;
    const restantes: Saisie[] = [];
    for (const s of file) {
      try { await api.post('/evenements/', s); } catch (e) {
        if (e instanceof ErreurApi && e.statut === 0) restantes.push(s); // réseau coupé : on garde
        else if (e instanceof ErreurApi && e.statut >= 500) restantes.push(s);
        else setErreur(`Une saisie a été refusée : ${(e as Error).message}`);
      }
    }
    ecrire(id, restantes); setAttente(restantes); evts.recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useIntervalle(() => { if (lire(id).length) vider(); }, 10000);

  const surTerrain = (e: React.MouseEvent<SVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p: [number, number] = [Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10];
    if (AVEC_ARRIVEE.includes(type) && depart && !arrivee) setArrivee(p); else { setDepart(p); setArrivee(null); }
  };

  const enregistrer = async () => {
    setErreur(null); setInfo(null);
    if (!joueur) return setErreur(type === 'REMPLACEMENT' ? 'Choisissez le joueur entrant.' : 'Choisissez le joueur.');
    if (type === 'REMPLACEMENT' && !sortant) return setErreur('Choisissez le joueur sortant.');
    if (!depart && !SANS_TERRAIN.includes(type)) return setErreur("Cliquez sur le terrain pour placer l'action.");
    const t = Math.floor(video.current?.currentTime ?? 0);
    const minute = minuteManuelle !== '' ? Number(minuteManuelle) : Math.min(m.duree, Math.floor(t / 60));
    const s: Saisie = {
      cle_idempotence: nouvelleCle(), match: Number(id), joueur, type_action: type, minute, temps_video: t,
      zone_x: depart?.[0] ?? 50, zone_y: depart?.[1] ?? 50, resultat: type === 'BUT' ? true : reussie,
      ...(type === 'REMPLACEMENT' && sortant ? { joueur_lie: sortant } : {}),
      ...(AVEC_ARRIVEE.includes(type) && arrivee ? { fin_x: arrivee[0], fin_y: arrivee[1] } : {}),
      ...(['TIR', 'BUT'].includes(type) ? { partie_corps: partie } : {}),
      qualificatifs: details.filter((d) => QUALIFICATIFS[d].types.includes(type)),
    };
    try { await api.post('/evenements/', s); setInfo(`${TYPES_ACTION[type]} enregistrée (minute ${minute}).`); evts.recharger(); }
    catch (e) {
      if (e instanceof ErreurApi && (e.statut === 0 || e.statut >= 500)) {
        const f = [...lire(id), s]; ecrire(id, f); setAttente(f); setInfo('Réseau indisponible : saisie gardée sur cet appareil, elle sera renvoyée.');
      } else return setErreur((e as Error).message);
    }
    setDepart(null); setArrivee(null); setSortant(null); setDetails([]);
  };
  const supprimer = async (e: any) => { try { await api.delete(`/evenements/${e.id}/`); evts.recharger(); } catch (x) { setErreur((x as Error).message); } };
  const fermer = async () => { try { await api.post(`/matchs/${id}/fermer-codage/`); setVerrouOk(false); match.recharger(); } catch (e) { setErreur((e as Error).message); } };
  const valider = async () => {
    if (attente.length) return setErreur(`${attente.length} saisie(s) ne sont pas encore arrivées au serveur : attendez le retour du réseau.`);
    if (!window.confirm('Valider le match ? Les statistiques seront calculées et publiées.')) return;
    setValidation(null);
    try { await api.post(`/matchs/${id}/valider/`); setVerrouOk(false); match.recharger(); setInfo('Match validé : statistiques publiées.'); }
    catch (e) { setErreur((e as Error).message); setValidation(((e as any).donnees?.erreurs as string[]) || null); }
  };

  if (!m) return <Chargement />;
  const utilisable = ['VIDEO_IMPORTEE', 'EN_CODAGE'].includes(m.etat);
  const liste: any[] = Array.isArray(evts.donnees) ? evts.donnees : evts.donnees?.results || []; // la liste des événements n'est pas paginée

  return (
    <>
      <Titre titre="Codage vidéo" sous={<>{m.domicile_nom} {m.score_domicile} – {m.score_exterieur} {m.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></>}
        droite={<div className="flex items-center gap-2"><Badge ton={verrouOk ? 'vert' : 'gris'}>{verrouOk ? 'Codage ouvert' : 'Codage fermé'}</Badge>{attente.length ? <Badge ton="orange">{attente.length} en attente d'envoi</Badge> : null}</div>} />
      <div className="space-y-4">
        <Alerte ton="rouge">{erreur}</Alerte>
        {validation?.length ? <Alerte ton="rouge">{validation.map((v) => <span key={v} className="block">• {v}</span>)}</Alerte> : null}
        <Alerte ton="vert">{info}</Alerte>
        {!utilisable ? <Alerte ton="orange">Le codage exige un match à l'état « Vidéo importée » ou « En codage » (actuellement : {m.etat_libelle}).</Alerte> : null}
        {utilisable && !verrouOk ? <div className="flex items-center gap-3"><Bouton onClick={ouvrir}>Ouvrir le codage</Bouton><span className="text-sm text-slate-500">Le match est verrouillé pour vous ; le verrou est renouvelé automatiquement.</span></div> : null}
      </div>

      {utilisable && verrouOk ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card titre="Vidéo">
              {m.video_lecture
                ? <video ref={video} src={estHls(m.video_lecture) ? undefined : m.video_lecture} controls className="w-full rounded-lg bg-black" />
                : <Alerte ton="bleu">Aucune vidéo lisible. La minute se saisit alors à la main ci-dessous.</Alerte>}
              <div className="mt-3 max-w-[10rem]"><label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Minute (laisser vide = selon la vidéo)</span>
                <input type="number" min={0} max={m.duree} value={minuteManuelle} onChange={(e) => setMinuteManuelle(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label></div>
            </Card>
            <Card titre={`Actions codées (${liste.length})`}>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
                {[...liste].sort((a, b) => b.temps_video - a.temps_video || b.id - a.id).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <span className="w-9 text-right font-bold text-slate-400">{e.minute}'</span>
                    <span className="flex-1"><span className="font-medium text-navy">{e.type_libelle}</span> <span className="text-slate-500">{e.joueur_nom}</span>{e.qualificatifs?.length ? <span className="block text-xs text-slate-400">{e.qualificatifs.map((c: string) => QUALIFICATIFS[c]?.libelle || c).join(' · ')}</span> : null}</span>
                    {e.source === 'AI' ? <Badge ton="bleu">IA</Badge> : null}
                    <Badge ton={e.resultat ? 'vert' : 'gris'}>{e.resultat ? 'Réussie' : 'Ratée'}</Badge>
                    <button aria-label="Supprimer" className="text-slate-400 hover:text-brand-red" onClick={() => supprimer(e)}>✕</button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="space-y-6">
            <Card titre="Nouvelle action">
              <div className="mb-4 flex gap-2">
                {([['domicile', m.domicile_nom], ['exterieur', m.exterieur_nom]] as const).map(([k, n]) => (
                  <button key={k} onClick={() => { setClub(k); setJoueur(null); }} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${club === k ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-slate-300 text-slate-600'}`}>{n}</button>))}
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {compo.map((c) => (
                  <button key={c.joueur} onClick={() => setJoueur(c.joueur)} className={`truncate rounded-lg border px-2 py-1.5 text-left text-sm ${joueur === c.joueur ? 'border-brand-green bg-emerald-50 font-semibold' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="mr-1 text-slate-400">{c.numero_maillot ?? ''}</span>{c.joueur_nom}</button>))}
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(TYPES_ACTION).map(([k, l]) => (
                  <button key={k} onClick={() => { setType(k); setArrivee(null); setDetails([]); }} className={`rounded-full border px-3 py-1 text-sm font-medium ${type === k ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 text-slate-700'}`}>{l}</button>))}
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
                {type !== 'BUT' ? <label className="flex items-center gap-2"><input type="checkbox" checked={reussie} onChange={(e) => setReussie(e.target.checked)} /> Réussie</label> : null}
                {['TIR', 'BUT'].includes(type) ? (
                  <select value={partie} onChange={(e) => setPartie(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1">{PARTIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>) : null}
              </div>
              {Object.entries(QUALIFICATIFS).some(([, q]) => q.types.includes(type)) ? (
                <fieldset className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm"><legend className="mb-1 text-slate-500">Détails (facultatif)</legend>
                  {Object.entries(QUALIFICATIFS).filter(([, q]) => q.types.includes(type)).map(([code, q]) => (
                    <label key={code} className="flex items-center gap-2"><input type="checkbox" checked={details.includes(code)} onChange={(e) => setDetails((d) => (e.target.checked ? [...d, code] : d.filter((x) => x !== code)))} /> {q.libelle}</label>))}
                </fieldset>) : null}
              {type === 'REMPLACEMENT' ? <p className="mb-2 text-sm text-slate-600">Joueur <b>entrant</b> : choisi ci-dessus. Joueur <b>sortant</b> :
                <select value={sortant ?? ''} onChange={(e) => setSortant(e.target.value ? Number(e.target.value) : null)} className="ml-2 rounded-lg border border-slate-300 px-2 py-1"><option value="">— choisir —</option>{compo.filter((c) => c.joueur !== joueur).map((c) => <option key={c.joueur} value={c.joueur}>{c.numero_maillot ? `${c.numero_maillot} · ` : ''}{c.joueur_nom}</option>)}</select></p> : null}
              <p className="mb-2 text-sm text-slate-600">{AVEC_ARRIVEE.includes(type) ? "Cliquez le point de départ, puis le point d'arrivée." : "Cliquez l'endroit de l'action."} L'équipe attaque vers la droite.</p>
              <div>
                <Terrain>
                  <rect width={L} height={H} fill="transparent" onClick={surTerrain} style={{ cursor: 'crosshair' }} />
                  {depart ? <circle cx={(depart[0] / 100) * L} cy={(depart[1] / 100) * H} r={1.6} fill="#20B56B" /> : null}
                  {depart && arrivee ? <line x1={(depart[0] / 100) * L} y1={(depart[1] / 100) * H} x2={(arrivee[0] / 100) * L} y2={(arrivee[1] / 100) * H} stroke="#E5484D" strokeWidth={0.6} /> : null}
                  {arrivee ? <circle cx={(arrivee[0] / 100) * L} cy={(arrivee[1] / 100) * H} r={1.6} fill="#E5484D" /> : null}
                </Terrain>
              </div>
              <Bouton className="mt-4 w-full" onClick={enregistrer}>Enregistrer l'action</Bouton>
            </Card>
            <Card titre="Fin du codage">
              <div className="flex flex-wrap gap-3">
                <Link to={`/app/matchs/${id}/verification-ia`}><Bouton genre="secondaire">Propositions de l'IA</Bouton></Link>
                <Bouton genre="secondaire" onClick={fermer}>Fermer le codage</Bouton>
                <Bouton genre="succes" onClick={valider}>Valider le match</Bouton>
              </div>
              <p className="mt-2 text-xs text-slate-500">La validation contrôle la cohérence, puis calcule et publie les statistiques, centiles et indices.</p>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
