import { useCallback, useEffect, useRef, useState, type MutableRefObject, type VideoHTMLAttributes } from 'react';
import { api } from '../lib/api';
import { estHls, useHls } from '../lib/hls';
import { useIntervalle } from '../lib/hooks';
import { Alerte, Badge, Bouton, Card } from './ui';

const RETARD_MAX = 12; // secondes derrière le bord du flux au-delà desquelles on propose de revenir au direct

/** Élément vidéo : remonté à chaque changement de source ou nouvel essai, ce qui rattache aussi le flux HLS. */
function Lecteur({ src, refVideo, ...p }: VideoHTMLAttributes<HTMLVideoElement> & { src: string; refVideo: MutableRefObject<HTMLVideoElement | null> }) {
  useHls(refVideo, src);
  return <video {...p} ref={refVideo} src={estHls(src) ? undefined : src} />;
}

/** Vidéo du match sur l'écran du direct : flux en cours (HLS) ou vidéo importée, avec le second angle s'il existe.
 *  L'adresse n'est relue que tant qu'aucune vidéo n'est connue, ou à la demande : un lien signé qui change à chaque
 *  lecture ne doit pas relancer le lecteur. */
export default function VideoDirect({ matchId }: { matchId: string }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [sources, setSources] = useState<string[] | null>(null);
  const [angle, setAngle] = useState(0);
  const [enDirect, setEnDirect] = useState(false);
  const [retard, setRetard] = useState(0);
  const [erreur, setErreur] = useState(false);
  const [essai, setEssai] = useState(0);
  const src = sources?.[angle] || sources?.[0];

  const lire = useCallback(() => {
    api.get<any>(`/matchs/${matchId}/`).then((m) => setSources([m.video_lecture, m.video_url_2].filter(Boolean))).catch(() => setSources((s) => s || []));
  }, [matchId]);
  useEffect(() => { setSources(null); setAngle(0); lire(); }, [lire]);
  useIntervalle(() => { if (!sources?.length) lire(); }, 30000); // une caméra peut être reliée pendant le match
  useEffect(() => { setErreur(false); setEnDirect(false); }, [src, essai]);

  /** Bord du flux : la dernière seconde disponible d'un direct. */
  const bord = () => { const s = video.current?.seekable; return s && s.length ? s.end(s.length - 1) : 0; };
  const suivre = () => {
    const v = video.current; if (!v) return;
    const direct = v.duration === Infinity;
    setEnDirect(direct); setRetard(direct ? Math.max(0, bord() - v.currentTime) : 0);
  };

  if (sources === null) return null;
  return (
    <Card titre={enDirect ? 'Vidéo en direct' : 'Vidéo du match'}
      droite={<span className="flex flex-wrap items-center gap-2">
        {enDirect ? <Badge ton={retard > RETARD_MAX ? 'orange' : 'rouge'}>{retard > RETARD_MAX ? `En différé de ${Math.round(retard)} s` : '● En direct'}</Badge> : null}
        {enDirect && retard > RETARD_MAX ? <Bouton genre="secondaire" onClick={() => { const v = video.current; if (v) { v.currentTime = Math.max(0, bord() - 2); v.play().catch(() => {}); } }}>Revenir au direct</Bouton> : null}
        {sources.length > 1 ? <Bouton genre="secondaire" onClick={() => setAngle(angle ? 0 : 1)}>Angle {angle ? 1 : 2}</Bouton> : null}
      </span>}>
      {src ? (
        <>
          <Lecteur key={`${src}-${essai}`} refVideo={video} src={src} controls autoPlay muted playsInline className="mx-auto block max-h-[70vh] w-full bg-black"
            onLoadedMetadata={suivre} onDurationChange={suivre} onTimeUpdate={suivre} onError={() => setErreur(true)} />
          {erreur ? <div className="mt-3 flex flex-wrap items-center gap-3"><Alerte ton="orange">La vidéo ne se lit pas (flux arrêté, lien expiré ou format non reconnu).</Alerte><Bouton genre="secondaire" onClick={() => { setEssai((n) => n + 1); lire(); }}>Réessayer</Bouton></div> : null}
          <p className="mt-2 text-xs text-slate-500">Le son est coupé au démarrage. {enDirect ? "L'image peut avoir quelques secondes de décalage avec les chiffres." : "Cette vidéo n'est pas un flux en direct : elle ne suit pas les chiffres."}</p>
        </>
      ) : <p className="text-sm text-slate-500">Aucune vidéo lisible pour ce match. Ajoutez l'adresse d'un flux (HLS) ou reliez une caméra ; elle apparaîtra ici.</p>}
    </Card>
  );
}
