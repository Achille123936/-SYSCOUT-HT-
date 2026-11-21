import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import fond from '../assets/accueil-fond.jpg';

// Panneau de gauche des pages de connexion et d'inscription (écrans larges) : image, message et avantages.
export default function PanneauAuth({ titre, avantages }: { titre: ReactNode; avantages: [string, string][] }) {
  return (
    <aside className="relative isolate hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between">
      <img src={fond} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/95 via-navy/80 to-navy" />
      <div className="p-12"><Link to="/" className="text-lg font-extrabold">SYSCOUT<span className="text-brand-green">-HT</span></Link></div>
      <div className="p-12 pb-16">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-green">Ligue Haïtienne</p>
        <h2 className="max-w-md text-4xl font-extrabold leading-tight">{titre}</h2>
        <ul className="mt-8 max-w-md space-y-5">
          {avantages.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-green text-[11px] font-black text-navy">✓</span>
              <span><span className="block font-semibold">{t}</span><span className="text-sm text-white/65">{d}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="h-1.5 w-full bg-gradient-to-r from-[#00209F] to-[#D21034]" aria-hidden="true" />
    </aside>
  );
}
