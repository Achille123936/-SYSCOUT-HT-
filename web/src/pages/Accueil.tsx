import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Pied from '../components/Pied';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useChargement } from '../lib/hooks';
import MatchsEnDirect from '../components/MatchsEnDirect';
import fond from '../assets/accueil-fond.jpg';

const FONCTIONS: [string, string][] = [
  ['Codage vidéo', "Chaque action du match, codée action par action : type, joueur, zone du terrain, départ et arrivée des passes."],
  ['Direct', 'Score, minute et statistiques mis à jour en temps réel pendant le codage du match.'],
  ['Statistiques et centiles', 'Valeurs par 90 minutes, centiles par poste et indice de performance (minimum 450 minutes).'],
  ['Comparaison de joueurs', 'De deux à cinq joueurs côte à côte, avec leurs minutes jouées.'],
  ['IA avec vérification humaine', "L'IA propose, l'analyste confirme, corrige ou rejette : aucune donnée non vérifiée n'est présentée comme officielle."],
  ['Rapports de scouting', 'Rapports validés, shortlists et export PDF.'],
];

// Page d'accueil publique : ce qu'est SYSCOUT-HT, les matchs en direct et les offres (RG11).
export default function Accueil() {
  const { utilisateur } = useAuth();
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }, [hash]);
  const chiffres = useChargement<any>(() => api.get('/chiffres-publics/'));
  const formules = useChargement<any[]>(() => api.get('/formules-publiques/'));
  const c = chiffres.donnees;

  return (
    <div className="min-h-screen bg-navy text-white">

      <section className="relative isolate overflow-hidden">
        <img src={fond} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/85 to-navy/40" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-navy to-transparent" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-lg font-extrabold">SYSCOUT<span className="text-brand-green">-HT</span></span>
        <nav className="flex items-center gap-3 text-sm">
          {utilisateur
            ? <Link className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-white" to="/app">Mon espace</Link>
            : <Link className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-white" to="/connexion">Se connecter</Link>}
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-5 pb-14 pt-10">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs">
          <span className="h-2 w-2 rounded-full bg-brand-green" />Ligue Haïtienne{c?.saison ? ` · saison ${c.saison}` : ''}
        </p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">L'analyse du football haïtien accessible à tous.</h1>
        <p className="mt-4 max-w-2xl text-lg text-white/70">
          Les matchs de la Ligue codés action par action, des statistiques pour chaque joueur et des rapports de scouting pour les clubs.
        </p>
        <div className="mt-8 flex flex-wrap gap-6">
          {[[c?.joueurs, 'joueurs suivis'], [c?.matchs_codes, 'matchs codés'], [c?.evenements, 'actions codées'], [c?.clubs?.length, 'clubs']]
            .filter(([v]) => v !== undefined && v !== null).map(([v, nom]) => (
              <div key={String(nom)}><p className="text-3xl font-extrabold">{String(v)}</p><p className="text-sm text-white/60">{nom}</p></div>
            ))}
        </div>
      </div>
      </section>

      <section id="direct" className="scroll-mt-4 border-y border-white/10 bg-white/[0.03] py-10">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-white/50">Matchs en direct</h2>
          <MatchsEnDirect sombre />
          <Link to="/connexion" className="mt-4 inline-block text-sm text-blue-300 hover:underline">Connectez-vous pour suivre les statistiques en direct ›</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="mb-6 text-2xl font-extrabold">Tout ce qu'il faut pour analyser et recruter</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FONCTIONS.map(([titre, texte]) => (
            <div key={titre} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="font-bold">{titre}</h3><p className="mt-2 text-sm text-white/65">{texte}</p>
            </div>
          ))}
        </div>
      </section>

      {c?.clubs?.length ? (
        <section className="mx-auto max-w-6xl px-5 pb-14">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-white/50">Les clubs suivis</h2>
          <div className="flex flex-wrap gap-2">
            {c.clubs.map((k: any) => <span key={`${k.nom}-${k.ville}`} className="rounded-full border border-white/15 px-3 py-1 text-sm">{k.nom} <span className="text-white/50">· {k.ville}</span></span>)}
          </div>
        </section>
      ) : null}

      {formules.donnees?.length ? (
        <section id="formules" className="mx-auto max-w-6xl scroll-mt-4 px-5 pb-16">
          <h2 className="mb-6 text-2xl font-extrabold">Formules d'abonnement</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {formules.donnees.map((f) => (
              <div key={f.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="text-lg font-bold">{f.nom}</h3>
                <p className="mt-2 text-3xl font-extrabold">{Number(f.prix_mensuel_htg).toLocaleString('fr-FR')} <span className="text-base font-medium text-white/60">HTG / mois</span></p>
                <p className="mt-3 text-sm text-white/65">{f.nombre_comptes} compte(s) · {f.rapports_inclus} rapport(s) inclus</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Pied />
    </div>
  );
}
