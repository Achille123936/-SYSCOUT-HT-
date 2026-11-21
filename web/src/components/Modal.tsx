import { useEffect, type ReactNode } from 'react';

export default function Modal({ titre, ouvert, onFermer, children, large = false }: { titre: string; ouvert: boolean; onFermer: () => void; children: ReactNode; large?: boolean }) {
  useEffect(() => {
    if (!ouvert) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [ouvert, onFermer]);
  if (!ouvert) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div role="dialog" aria-modal="true" aria-label={titre} className={`my-8 w-full rounded-2xl bg-white p-6 shadow-2xl ${large ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-navy">{titre}</h2>
          <button aria-label="Fermer" onClick={onFermer} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
