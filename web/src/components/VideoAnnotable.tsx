import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type MutableRefObject } from 'react';

export interface Taille { l: number; h: number }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Vidéo avec une couche SVG en pourcentages de l'image (0 à 100 sur chaque axe) et ses propres commandes de lecture.
 *  `capture` : la couche reçoit les clics (le curseur devient une croix) au lieu de les laisser à la vidéo. */
export default function VideoAnnotable({ src, capture, onPoint, onGlisser, onFin, rendu, refVideo, onTemps, aide }: {
  src?: string; capture?: boolean;
  onPoint?: (x: number, y: number, bas: boolean) => void; // bas : le bouton vient d'être pressé
  onGlisser?: (x: number, y: number) => void; onFin?: () => void;
  rendu?: (taille: Taille, temps: number) => ReactNode;
  refVideo?: MutableRefObject<HTMLVideoElement | null>; onTemps?: (t: number) => void; aide?: string;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const boite = useRef<HTMLDivElement>(null);
  const [temps, setTemps] = useState(0);
  const [duree, setDuree] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [taille, setTaille] = useState<Taille>({ l: 16, h: 9 });
  const [appui, setAppui] = useState(false);

  useEffect(() => {
    if (!boite.current) return;
    const o = new ResizeObserver(([e]) => setTaille({ l: e.contentRect.width || 16, h: e.contentRect.height || 9 }));
    o.observe(boite.current);
    return () => o.disconnect();
  }, []);

  const pos = (e: MouseEvent<SVGSVGElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = (v: number) => Math.max(0, Math.min(100, v));
    return [Math.round(c(((e.clientX - r.left) / r.width) * 100) * 10) / 10, Math.round(c(((e.clientY - r.top) / r.height) * 100) * 10) / 10];
  };
  const aller = (t: number) => { if (video.current) video.current.currentTime = Math.max(0, Math.min(duree || t, t)); };

  if (!src) return <div className="rounded-lg bg-slate-100 p-6 text-center text-sm text-slate-500">Aucune vidéo lisible pour ce match.</div>;
  return (
    <div>
      <div ref={boite} className="relative overflow-hidden rounded-lg bg-black">
        <video ref={(el) => { video.current = el; if (refVideo) refVideo.current = el; }} src={src} className="block w-full"
          onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; setTemps(t); onTemps?.(t); }} onLoadedMetadata={(e) => setDuree(e.currentTarget.duration)}
          onPlay={() => setLecture(true)} onPause={() => setLecture(false)} playsInline />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`absolute inset-0 h-full w-full ${capture ? 'cursor-crosshair' : 'pointer-events-none'}`}
          onMouseDown={capture ? (e) => { const [x, y] = pos(e); setAppui(true); onPoint?.(x, y, true); } : undefined}
          onMouseMove={capture && appui ? (e) => { const [x, y] = pos(e); onGlisser?.(x, y); } : undefined}
          onMouseUp={capture ? () => { setAppui(false); onFin?.(); } : undefined} onMouseLeave={capture ? () => { if (appui) { setAppui(false); onFin?.(); } } : undefined}>
          <defs><marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke" /></marker></defs>
          {rendu?.(taille, temps)}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <button className="rounded border border-slate-300 px-2 py-1" onClick={() => aller(temps - 5)} aria-label="Reculer de 5 secondes">−5 s</button>
        <button className="rounded border border-slate-300 px-2 py-1" onClick={() => aller(temps - 1)} aria-label="Reculer de 1 seconde">−1 s</button>
        <button className="w-20 rounded bg-navy px-3 py-1 font-semibold text-white" onClick={() => (lecture ? video.current?.pause() : video.current?.play())}>{lecture ? 'Pause' : 'Lecture'}</button>
        <button className="rounded border border-slate-300 px-2 py-1" onClick={() => aller(temps + 1)} aria-label="Avancer de 1 seconde">+1 s</button>
        <button className="rounded border border-slate-300 px-2 py-1" onClick={() => aller(temps + 5)} aria-label="Avancer de 5 secondes">+5 s</button>
        <input type="range" min={0} max={duree || 0} step={0.1} value={temps} onChange={(e) => aller(Number(e.target.value))} className="flex-1" aria-label="Position dans la vidéo" />
        <span className="w-24 text-right font-mono text-xs text-slate-500">{mmss(temps)} / {mmss(duree)}</span>
      </div>
      {aide ? <p className="mt-1 text-xs text-slate-500">{aide}</p> : null}
    </div>
  );
}
