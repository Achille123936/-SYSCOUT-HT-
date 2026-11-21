import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useIntervalle } from '../lib/hooks';

interface MatchDirect {
  id: number; competition: string; journee: number; stade: string; minute: number; score: [number, number];
  domicile: { nom: string; sigle: string }; exterieur: { nom: string; sigle: string };
}

// Matchs codés en ce moment : score et minute seulement (liste publique, sans compte), rafraîchie toutes les 15 s.
export default function MatchsEnDirect({ surOuvrir, sombre = false }: { surOuvrir?: (m: MatchDirect) => void; sombre?: boolean }) {
  const [matchs, setMatchs] = useState<MatchDirect[] | null>(null);
  const charger = useCallback(() => { api.get<MatchDirect[]>('/matchs-en-direct/').then(setMatchs).catch(() => setMatchs((m) => m || [])); }, []);
  useEffect(charger, [charger]);
  useIntervalle(charger, 15000);

  if (matchs === null) return null;
  if (!matchs.length) return <p className={`text-sm ${sombre ? 'text-white/60' : 'text-slate-500'}`}>Aucun match en direct pour le moment.</p>;
  const carte = sombre ? 'border-white/15 bg-white/5 text-white' : 'border-slate-200 bg-white text-navy';
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {matchs.map((m) => {
        const Balise = surOuvrir ? 'button' : 'div';
        return (
          <Balise key={m.id} onClick={surOuvrir ? () => surOuvrir(m) : undefined}
            className={`rounded-2xl border p-4 text-left ${carte} ${surOuvrir ? 'transition hover:border-brand-blue' : ''}`}>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold tracking-wide text-brand-red">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-red" />EN DIRECT · {m.minute}'
              </span>
              <span className={`truncate ${sombre ? 'text-white/60' : 'text-slate-500'}`}>{m.competition} · J{m.journee}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex-1 truncate text-right font-semibold">{m.domicile.nom}</span>
              <span className="text-2xl font-extrabold">{m.score[0]} – {m.score[1]}</span>
              <span className="flex-1 truncate font-semibold">{m.exterieur.nom}</span>
            </div>
          </Balise>
        );
      })}
    </div>
  );
}
