import { useEffect, useState, type MutableRefObject } from 'react';
import { CATEGORIES_MARQUE, TYPES_ACTION } from '../lib/format';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const COULEURS: Record<string, string> = { BUT: '#F5D90A', TIR: '#F28C28', PASSE: '#00AAFF', CENTRE: '#7FD4FF', DRIBBLE: '#B07CFF',
  FAUTE: '#E5484D', CARTON: '#E5484D', INTERCEPTION: '#20B56B', RECUPERATION: '#20B56B' };

/** Chronologie de la vidéo : un repère par action, un clic y ramène la lecture. Une ligne par type d'action présent. */
export default function Chronologie({ actions, marques = [], video, temps, aller }: {
  actions: any[]; marques?: any[]; video: MutableRefObject<HTMLVideoElement | null>; temps: number; aller: (t: number) => void;
}) {
  const [duree, setDuree] = useState(0);
  useEffect(() => { // la vidéo peut apparaître ou changer après le premier rendu
    const v = video.current;
    const d = v?.duration;
    if (d && Number.isFinite(d) && d !== duree) setDuree(d);
  });
  const fin = duree || Math.max(1, ...actions.map((e) => e.temps_video), ...marques.map((m) => m.temps_video));
  const types = Object.keys(TYPES_ACTION).filter((t) => actions.some((e) => e.type_action === t));
  if (!actions.length && !marques.length) return <p className="text-sm text-slate-500">Aucune action à placer sur la chronologie.</p>;
  return (
    <div className="space-y-1" aria-label="Chronologie des actions">
      {Object.entries(CATEGORIES_MARQUE).filter(([c]) => marques.some((m) => m.categorie === c)).map(([c, cat]) => (
        <div key={c} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs font-bold">{cat.libelle}</span>
          <div className="relative h-4 flex-1 bg-slate-100">
            {marques.filter((m) => m.categorie === c && m.temps_video <= fin).map((m) => (
              <button key={m.id} onClick={() => aller(m.temps_video + 5)} title={`${mmss(m.temps_video)} · ${m.etiquettes.join(', ')}`} aria-label={`${cat.libelle} à ${mmss(m.temps_video)}`}
                className="absolute top-0 h-4 hover:brightness-125" style={{ left: `${(m.temps_video / fin) * 100}%`, width: `max(6px, ${(10 / fin) * 100}%)`, background: cat.couleur }} />
            ))}
          </div>
        </div>
      ))}
      {types.map((t) => (
        <div key={t} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-slate-500">{TYPES_ACTION[t]}</span>
          <div className="relative h-4 flex-1 bg-slate-100">
            {actions.filter((e) => e.type_action === t && e.temps_video <= fin).map((e) => (
              <button key={e.id} onClick={() => aller(e.temps_video)} title={`${mmss(e.temps_video)} · ${e.joueur_nom}`}
                aria-label={`${TYPES_ACTION[t]} de ${e.joueur_nom} à ${mmss(e.temps_video)}`}
                className="absolute top-0.5 h-3 w-1.5 -translate-x-1/2 hover:scale-150" style={{ left: `${(e.temps_video / fin) * 100}%`, background: COULEURS[t] || '#94a3b8' }} />
            ))}
            <span className="pointer-events-none absolute inset-y-0 w-px bg-brand-red" style={{ left: `${Math.min(100, (temps / fin) * 100)}%` }} aria-hidden="true" />
          </div>
        </div>
      ))}
      <div className="flex justify-between pl-[7.5rem] text-[11px] text-slate-400"><span>0:00</span><span>{mmss(fin)}</span></div>
    </div>
  );
}
