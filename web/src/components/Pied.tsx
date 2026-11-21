import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SERVEUR } from '../lib/api';

const COLONNES: { titre: string; liens: [string, string][] }[] = [
  { titre: 'Plateforme', liens: [['Matchs en direct', '/#direct'], ['Joueurs', '/app/joueurs'], ['Comparaison de joueurs', '/app/comparaison'], ['Statistiques', '/app/classements'], ['Rapports de scouting', '/app/rapports']] },
  { titre: 'Pour qui', liens: [['Clubs et académies', '/inscription'], ['Analystes vidéo', '/inscription'], ['Scouts et directeurs sportifs', '/inscription'], ['Entraîneurs', '/inscription'], ['Joueurs', '/inscription']] },
  { titre: 'Accès', liens: [['Se connecter', '/connexion'], ['Demander un compte', '/inscription'], ['Formules d\'abonnement', '/#formules'], ['Tableau de bord', '/app']] },
];

const PRINCIPES = ['Données vérifiées par des analystes', "L'IA propose, l'humain décide", 'Hors ligne : rien ne se perd'];

// Pied de page de l'accueil : marque, colonnes de liens, principes du produit, barre légale et retour en haut.
export default function Pied() {
  const annee = new Date().getFullYear();
  const [service, setService] = useState<'verif' | 'ok' | 'hs'>('verif');
  useEffect(() => { // état réel du serveur (GET /sante/ : serveur et base joignables)
    fetch(`${SERVEUR}/sante/`).then((r) => setService(r.ok ? 'ok' : 'hs')).catch(() => setService('hs'));
  }, []);
  return (
    <footer className="bg-[#0a1322] text-white" aria-label="Pied de page">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#00209F] via-[#00209F] to-[#D21034]" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-14">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link to="/" className="inline-flex items-center gap-3" aria-label="SYSCOUT-HT, accueil">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-green text-lg font-black text-navy">S</span>
              <span className="text-2xl font-extrabold tracking-tight">SYSCOUT<span className="text-brand-green">-HT</span></span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">
              L'analyse vidéo, les statistiques et le scouting du football haïtien, au même endroit : de la saisie sur le terrain au rapport du directeur sportif.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              {PRINCIPES.map((p) => (
                <li key={p} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-brand-green" />{p}</li>
              ))}
            </ul>
          </div>

          <nav className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-8" aria-label="Plan du site">
            {COLONNES.map((c) => (
              <div key={c.titre}>
                <h2 className="mb-4 border-b border-white/10 pb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/50">{c.titre}</h2>
                <ul className="space-y-2.5 text-sm">
                  {c.liens.map(([nom, chemin]) => (
                    <li key={nom}>
                      <Link to={chemin} className="group inline-flex items-center gap-1.5 text-white/80 transition hover:text-white">
                        <span className="h-px w-0 bg-brand-green transition-all group-hover:w-3" aria-hidden="true" />{nom}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-5 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center">
          <p>© {annee} SYSCOUT-HT · Football haïtien · Observe. Analyse. Découvre. Perform.</p>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-2" role="status"><span className={`h-2 w-2 rounded-full ${service === 'ok' ? 'bg-brand-green' : service === 'hs' ? 'bg-brand-red' : 'bg-white/30'}`} />{service === 'ok' ? 'Service en ligne' : service === 'hs' ? 'Service indisponible' : 'Vérification…'}</span>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="rounded-full border border-white/20 px-4 py-1.5 font-medium text-white/80 transition hover:border-white/50 hover:text-white">
              Haut de page ↑
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
