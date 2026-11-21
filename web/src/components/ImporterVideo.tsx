import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, televerser } from '../lib/api';
import { dateFR } from '../lib/format';
import Modal from './Modal';
import { Alerte, Bouton, Champ, Choix } from './ui';

export const EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv'];
export const TAILLE_MAX_MO = 2048;
const taille = (o: number) => (o >= 1048576 ? `${(o / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.round(o / 1024)} Ko`);

/** Contrôle côté navigateur (le serveur refait les mêmes contrôles) ; renvoie le message d'erreur ou null. */
export function controlerFichier(f: File): string | null {
  if (!EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e))) return `Format non accepté. Formats acceptés : ${EXTENSIONS.join(', ')}.`;
  if (f.size === 0) return 'Le fichier est vide.';
  if (f.size > TAILLE_MAX_MO * 1048576) return `Fichier trop volumineux (${taille(f.size)}) : ${TAILLE_MAX_MO} Mo au plus.`;
  return null;
}

/** Fenêtre d'importation d'une vidéo de match : un fichier (glisser-déposer, avec progression) ou l'adresse d'une vidéo
 *  hébergée. Sans `matchId`, l'utilisateur choisit parmi les matchs qui attendent une vidéo. Le serveur n'accepte l'importation
 *  que tant que le codage n'a pas commencé (matchs « Planifié » ou « Vidéo importée »). */
export default function ImporterVideo({ ouvert, onFermer, matchId, onFait }: { ouvert: boolean; onFermer: () => void; matchId?: number; onFait?: (match: any) => void }) {
  const [mode, setMode] = useState<'fichier' | 'lien'>('fichier');
  const [choix, setChoix] = useState<string>(matchId ? String(matchId) : '');
  const [candidats, setCandidats] = useState<any[]>([]);
  const [fichier, setFichier] = useState<File | null>(null);
  const [lien, setLien] = useState('');
  const [progres, setProgres] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<any | null>(null);
  const [survol, setSurvol] = useState(false);
  const annulation = useRef<(() => void) | null>(null);
  const entree = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    setFichier(null); setLien(''); setProgres(null); setErreur(null); setFait(null); setChoix(matchId ? String(matchId) : '');
    if (!matchId) {
      Promise.all([api.tout('/matchs/', { etat: 'PLANIFIE' }), api.tout('/matchs/', { etat: 'VIDEO_IMPORTEE' })]).then(([a, b]) => setCandidats([...a, ...b])).catch((e) => setErreur(e.message));
    }
  }, [ouvert, matchId]);

  const prendre = (f: File | undefined) => {
    if (!f) return;
    const e = controlerFichier(f);
    setErreur(e); setFichier(e ? null : f);
  };
  const deposer = (e: DragEvent) => { e.preventDefault(); setSurvol(false); prendre(e.dataTransfer.files?.[0]); };

  const envoyer = async () => {
    setErreur(null);
    const id = matchId || Number(choix);
    if (!id) return setErreur('Choisissez le match.');
    try {
      let resultat;
      if (mode === 'fichier') {
        if (!fichier) return setErreur('Choisissez un fichier vidéo.');
        const corps = new FormData();
        corps.append('video', fichier);
        setProgres(0);
        const t = televerser(`/matchs/${id}/importer-video/`, corps, setProgres);
        annulation.current = t.annuler;
        resultat = await t.promesse;
      } else {
        if (!/^https?:\/\//i.test(lien.trim())) return setErreur("L'adresse doit commencer par http:// ou https://.");
        resultat = await api.post(`/matchs/${id}/importer-video/`, { video_url: lien.trim() });
      }
      setFait(resultat); onFait?.(resultat);
    } catch (e) { setErreur((e as Error).message); } finally { setProgres(null); annulation.current = null; }
  };
  const fermer = () => { annulation.current?.(); onFermer(); };
  const enCours = progres !== null;

  return (
    <Modal titre="Importer une vidéo" ouvert={ouvert} onFermer={fermer}>
      {fait ? (
        <div className="space-y-4">
          <Alerte ton="vert">Vidéo importée : le match est à l'état « {fait.etat_libelle} ». Vous pouvez maintenant coder le match.</Alerte>
          <Bouton onClick={fermer}>Terminer</Bouton>
        </div>
      ) : (
        <div className="space-y-4">
          {!matchId ? (
            <Choix libelle="Match" value={choix} onChange={(e) => setChoix(e.target.value)} disabled={enCours}>
              <option value="">— choisir un match qui attend sa vidéo —</option>
              {candidats.map((m) => <option key={m.id} value={m.id}>{dateFR(m.date_match)} · {m.domicile_nom} - {m.exterieur_nom} · {m.etat_libelle}</option>)}
            </Choix>
          ) : null}
          <div role="tablist" aria-label="Source de la vidéo" className="flex gap-2">
            {([['fichier', 'Fichier de mon ordinateur'], ['lien', 'Adresse (lien)']] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={mode === v} disabled={enCours} onClick={() => { setMode(v); setErreur(null); }}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${mode === v ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-slate-300 text-slate-600'}`}>{l}</button>
            ))}
          </div>
          <Alerte ton="rouge">{erreur}</Alerte>

          {mode === 'fichier' ? (
            <div>
              <div onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)} onDrop={deposer}
                className={`rounded-xl border-2 border-dashed p-8 text-center transition ${survol ? 'border-brand-blue bg-blue-50' : 'border-slate-300 bg-slate-50'}`}>
                <p className="text-3xl" aria-hidden="true">🎬</p>
                {fichier ? <p className="mt-2 text-sm font-semibold text-navy">{fichier.name} <span className="font-normal text-slate-500">· {taille(fichier.size)}</span></p>
                  : <p className="mt-2 text-sm text-slate-600">Glissez la vidéo ici, ou</p>}
                <button type="button" onClick={() => entree.current?.click()} disabled={enCours} className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{fichier ? 'Choisir un autre fichier' : 'Choisir un fichier'}</button>
                <input ref={entree} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.mov,.webm,.mkv" className="hidden" aria-label="Fichier vidéo" onChange={(e) => { prendre(e.target.files?.[0]); e.target.value = ''; }} />
                <p className="mt-3 text-xs text-slate-400">{EXTENSIONS.join(' ')} · {TAILLE_MAX_MO} Mo au plus</p>
              </div>
              {enCours ? (
                <div className="mt-4" role="status">
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-green transition-all" style={{ width: `${progres}%` }} /></div>
                  <p className="mt-1 text-xs text-slate-500">Envoi en cours : {progres} %</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <Champ libelle="Adresse de la vidéo" type="url" placeholder="https://…/match.mp4" value={lien} onChange={(e) => setLien(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Une vidéo déjà hébergée (MP4 ou flux web) : rien n'est copié sur le serveur.</p>
            </div>
          )}
          <div className="flex gap-3">
            <Bouton onClick={envoyer} disabled={enCours || (mode === 'fichier' ? !fichier : !lien.trim())}>{enCours ? 'Envoi…' : 'Importer'}</Bouton>
            {enCours ? <Bouton genre="secondaire" onClick={() => annulation.current?.()}>Annuler l'envoi</Bouton> : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
