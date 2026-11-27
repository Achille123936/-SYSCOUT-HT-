import { useEffect, useState, type MutableRefObject } from 'react';
import { api } from '../lib/api';
import type { useChargement } from '../lib/hooks';
import { CATEGORIES_MARQUE } from '../lib/format';
import { Alerte, Bouton, Vide } from './ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const AVANT = 5; // secondes : la séquence commence un peu avant le clic

/** Tableau de codage des séquences : un bouton (ou la touche 1 à 6) marque une phase de jeu à l'instant de la vidéo,
 *  avec les étiquettes cochées. Ces repères aident l'analyse ; ils n'entrent dans aucune statistique officielle. */
export default function TableauCodage({ matchId, video, marques, peutCoder }: {
  matchId: number; video: MutableRefObject<HTMLVideoElement | null>; marques: ReturnType<typeof useChargement<any[]>>; peutCoder: boolean;
}) {
  const [choisies, setChoisies] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const aller = (t: number) => { if (video.current) { video.current.currentTime = t; video.current.play().catch(() => {}); } };

  const marquer = async (categorie: string) => {
    setErreur(null);
    const permises = CATEGORIES_MARQUE[categorie].etiquettes;
    try {
      await api.post('/marques/', { match: matchId, categorie, temps_video: Math.max(0, Math.floor(video.current?.currentTime ?? 0) - AVANT),
        etiquettes: choisies.filter((c) => permises.includes(c)) });
      setChoisies([]); marques.recharger();
    } catch (e) { setErreur((e as Error).message); }
  };
  useEffect(() => {
    if (!peutCoder) return;
    const touche = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const code = Object.keys(CATEGORIES_MARQUE)[Number(e.key) - 1];
      if (code) marquer(code);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  });
  const supprimer = async (m: any) => { try { await api.delete(`/marques/${m.id}/`); marques.recharger(); } catch (e) { setErreur((e as Error).message); } };

  return (
    <div className="space-y-3">
      <Alerte ton="rouge">{erreur || marques.erreur}</Alerte>
      {peutCoder ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(CATEGORIES_MARQUE).map(([code, c], i) => (
            <div key={code} className="border border-slate-200 p-2">
              <button onClick={() => marquer(code)} className="w-full px-2 py-2 text-sm font-bold text-white hover:brightness-110" style={{ background: c.couleur }}>
                {c.libelle} <span className="ml-1 rounded-sm bg-black/30 px-1 text-[10px]">{i + 1}</span></button>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.etiquettes.map((t) => (
                  <button key={t} aria-pressed={choisies.includes(t)} onClick={() => setChoisies((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]))}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${choisies.includes(t) ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300'}`}>{t}</button>))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {peutCoder ? <p className="text-xs text-slate-500">Cochez les étiquettes, puis cliquez la phase (ou tapez 1 à 6). La séquence commence {AVANT} s avant l'instant affiché.</p> : null}
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
        {(marques.donnees || []).map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-1.5">
            <button className="font-mono text-xs text-brand-blue hover:underline" onClick={() => aller(m.temps_video)}>{mmss(m.temps_video)}</button>
            <span className="h-3 w-3 rounded-sm" style={{ background: CATEGORIES_MARQUE[m.categorie]?.couleur }} />
            <span className="flex-1"><b>{CATEGORIES_MARQUE[m.categorie]?.libelle || m.categorie}</b> <span className="text-slate-500">{m.etiquettes.join(' · ')}</span></span>
            <span className="text-xs text-slate-400">{m.auteur_nom}</span>
            {peutCoder ? <button aria-label="Supprimer la séquence" className="text-slate-400 hover:text-brand-red" onClick={() => supprimer(m)}>✕</button> : null}
          </li>
        ))}
      </ul>
      {marques.donnees && !marques.donnees.length ? <Vide>Aucune séquence marquée.</Vide> : null}
      {peutCoder && marques.donnees?.length ? <Bouton genre="secondaire" onClick={() => {
        const csv = ['temps;phase;etiquettes', ...marques.donnees!.map((m) => `${mmss(m.temps_video)};${CATEGORIES_MARQUE[m.categorie]?.libelle};${m.etiquettes.join(', ')}`)].join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `sequences-match-${matchId}.csv`; a.click();
      }}>Exporter les séquences (CSV)</Bouton> : null}
    </div>
  );
}
