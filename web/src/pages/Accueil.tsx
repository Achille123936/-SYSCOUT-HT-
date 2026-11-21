import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useChargement } from '../lib/hooks';
import MatchsEnDirect from '../components/MatchsEnDirect';
import Pied from '../components/Pied';
import fond from '../assets/accueil-fond.jpg';
import capDirect from '../assets/apercu-11-direct.jpg';
import capCodage from '../assets/apercu-14-codage.jpg';
import capComparaison from '../assets/apercu-17-comparaison.jpg';
import capJoueur from '../assets/apercu-06-fiche-joueur.jpg';

const NAV: [string, string][] = [['Plateforme', '#acces'], ['Matchs en direct', '#direct'], ['Pour chaque métier', '#metiers'], ['Aperçu', '#apercu'], ['Offres', '#formules']];

const ACCES: [string, string, string, string][] = [
  ['⚽', 'Matchs et direct', 'Score, minute et statistiques en temps réel.', '/app/matchs'],
  ['👤', 'Joueurs', 'Recherche, fiches, radar des centiles.', '/app/joueurs'],
  ['⚖️', 'Comparaison', 'De deux à cinq joueurs côte à côte.', '/app/comparaison'],
  ['📋', 'Rapports de scouting', 'Rédigés, validés, exportés en PDF.', '/app/rapports'],
  ['📊', 'Statistiques', 'Classements par poste et indice /100.', '/app/classements'],
  ['🎥', 'Codage vidéo', 'Chaque action codée sur la vidéo du match.', '/app/matchs'],
];

const METIERS: { nom: string; icone: string; titre: string; points: string[] }[] = [
  { nom: 'Analystes vidéo', icone: '🎬', titre: "Codez vite, vérifiez ce que propose l'IA", points: ['Saisie au clic sur le terrain, passes avec départ et arrivée', "Confirmer, corriger ou rejeter chaque proposition de l'IA", 'Télestration : flèches, zones, distances en mètres'] },
  { nom: 'Scouts', icone: '🔭', titre: 'Trouvez et suivez les talents', points: ['Recherche par poste, âge, club et indice de performance', 'Comparaison de joueurs et shortlists', 'Rapports soumis puis validés par le directeur sportif'] },
  { nom: 'Entraîneurs', icone: '📐', titre: 'Lisez votre équipe', points: ['Bilan, forme et effectif de votre club', 'Analyse tactique : formation, bloc, pressing, transitions', 'Heatmaps avec leurs limites annoncées'] },
  { nom: 'Clubs', icone: '🏟️', titre: 'Gérez vos joueurs et vos accès', points: ['Effectif et historique des joueurs', 'Comptes des entraîneurs et des joueurs', 'Protection renforcée des données des mineurs'] },
  { nom: 'Joueurs', icone: '🏃', titre: 'Consultez votre fiche', points: ['Vos statistiques et votre radar', 'Vos données physiques de match', 'Seulement ce qui vous concerne'] },
];

const APERCU: { id: string; nom: string; image: string; texte: string }[] = [
  { id: 'direct', nom: 'Direct', image: capDirect, texte: 'Suivez le score, les statistiques des deux équipes et la possession pendant que le match est codé.' },
  { id: 'codage', nom: 'Codage', image: capCodage, texte: 'Une action par clic : type, joueur, zone du terrain, résultat. Chaque saisie est sauvegardée tout de suite.' },
  { id: 'comparaison', nom: 'Comparaison', image: capComparaison, texte: 'Le radar des centiles et les statistiques de la saison pour comparer des joueurs du même poste.' },
  { id: 'joueur', nom: 'Fiche joueur', image: capJoueur, texte: 'Statistiques, indice de performance, carte des actions, historique des clubs et rapports.' },
];

const PRINCIPES: [string, string, string][] = [
  ["L'IA propose, l'analyste décide", "Chaque détection du moteur IA attend la décision d'un analyste : confirmer, corriger ou rejeter. Une donnée non vérifiée n'est jamais présentée comme officielle.", 'bg-blue-50 text-brand-blue'],
  ['Rien ne se perd', "Le codage continue sans Internet : les saisies restent sur l'appareil puis partent sans doublon au retour du réseau.", 'bg-emerald-50 text-emerald-700'],
  ['Des chiffres qui disent leurs limites', 'Une heatmap, un indice, un centile : chaque indicateur annonce sa définition et les limites des données.', 'bg-amber-50 text-amber-700'],
];

// Page d'accueil publique : antèt collant, hero, accès rapides, chiffres, matchs en direct, métiers, aperçu du produit,
// principes, clubs, offres (RG11) et appel à l'action.
export default function Accueil() {
  const { utilisateur } = useAuth();
  const { hash } = useLocation();
  const [menu, setMenu] = useState(false);
  const [defile, setDefile] = useState(false);
  const [metier, setMetier] = useState(0);
  const [apercu, setApercu] = useState(0);
  const chiffres = useChargement<any>(() => api.get('/chiffres-publics/'));
  const formules = useChargement<any[]>(() => api.get('/formules-publiques/'));
  const c = chiffres.donnees;
  const m = METIERS[metier], a = APERCU[apercu];

  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }); }, [hash]);
  useEffect(() => {
    const f = () => setDefile(window.scrollY > 24);
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  const aller = (ancre: string) => { setMenu(false); document.getElementById(ancre.slice(1))?.scrollIntoView({ behavior: 'smooth' }); };
  const stats = [[c?.joueurs, 'joueurs suivis'], [c?.matchs_codes, 'matchs codés'], [c?.evenements, 'actions codées'], [c?.clubs?.length, 'clubs'], [c?.competitions?.length, 'compétitions']]
    .filter(([v]) => v !== undefined && v !== null) as [number, string][];

  return (
    <div className="bg-white text-slate-800">
      <div className="hidden bg-navy text-xs text-white/70 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-1.5">
          <span>Observe. Analyse. Découvre. Perform.</span>
          <span className="flex items-center gap-5">
            <button onClick={() => aller('#direct')} className="hover:text-white">Matchs en direct</button>
            <button onClick={() => aller('#formules')} className="hover:text-white">Offres</button>
            <Link to="/inscription" className="hover:text-white">Demander un compte</Link>
          </span>
        </div>
      </div>

      <header className={`sticky top-0 z-40 transition ${defile ? 'bg-white/95 shadow-sm backdrop-blur' : 'bg-white'}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5" aria-label="SYSCOUT-HT, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy text-base font-black text-brand-green">S</span>
            <span className="text-xl font-extrabold tracking-tight text-navy">SYSCOUT<span className="text-brand-green">-HT</span></span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex" aria-label="Navigation principale">
            {NAV.map(([nom, ancre]) => <button key={nom} onClick={() => aller(ancre)} className="transition hover:text-navy">{nom}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            {utilisateur
              ? <Link to="/app" className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Mon espace</Link>
              : <>
                <Link to="/connexion" className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-100 sm:block">Se connecter</Link>
                <Link to="/inscription" className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-navy hover:brightness-95">S'inscrire</Link>
              </>}
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm lg:hidden" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menu">☰</button>
          </div>
        </div>
        {menu ? (
          <nav className="border-t border-slate-100 bg-white px-5 py-3 lg:hidden" aria-label="Menu mobile">
            {NAV.map(([nom, ancre]) => <button key={nom} onClick={() => aller(ancre)} className="block w-full py-2.5 text-left text-sm font-medium text-slate-700">{nom}</button>)}
            {!utilisateur ? <Link to="/connexion" className="block py-2.5 text-sm font-semibold text-navy">Se connecter</Link> : null}
          </nav>
        ) : null}
      </header>

      <section className="relative isolate overflow-hidden bg-navy text-white">
        <img src={fond} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/85 to-navy/35" />
        <div className="mx-auto max-w-6xl px-5 pb-40 pt-20 md:pb-48 md:pt-28">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-brand-green" />Ligue Haïtienne{c?.saison ? ` · saison ${c.saison}` : ''}
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">L'analyse du football haïtien, accessible à tous.</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/75 md:text-xl">Les matchs de la Ligue codés action par action, des statistiques pour chaque joueur et des rapports de scouting pour les clubs.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to={utilisateur ? '/app' : '/inscription'} className="rounded-xl bg-brand-green px-7 py-3.5 text-base font-bold text-navy shadow-lg shadow-black/20 transition hover:brightness-95">{utilisateur ? 'Ouvrir mon espace' : 'Créer un compte'}</Link>
            <button onClick={() => aller('#direct')} className="rounded-xl border border-white/40 px-7 py-3.5 text-base font-semibold text-white transition hover:bg-white/10">Voir les matchs en direct</button>
          </div>
        </div>
      </section>

      <section id="acces" className="relative z-10 mx-auto -mt-28 max-w-6xl scroll-mt-20 px-5 md:-mt-32">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ACCES.map(([icone, titre, texte, chemin]) => (
            <Link key={titre} to={chemin} className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-brand-blue hover:shadow-xl">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-2xl transition group-hover:bg-blue-50" aria-hidden="true">{icone}</span>
              <span><span className="block font-bold text-navy">{titre} <span className="inline-block text-brand-blue transition group-hover:translate-x-1" aria-hidden="true">›</span></span><span className="mt-0.5 block text-sm text-slate-500">{texte}</span></span>
            </Link>
          ))}
        </div>
      </section>

      {stats.length ? (
        <section className="mx-auto mt-16 max-w-6xl px-5">
          <dl className="grid grid-cols-2 gap-y-8 rounded-2xl bg-slate-50 px-6 py-8 md:grid-cols-5">
            {stats.map(([v, nom]) => (
              <div key={nom} className="text-center"><dd className="text-4xl font-extrabold text-navy">{v.toLocaleString('fr-FR')}</dd><dt className="mt-1 text-sm text-slate-500">{nom}</dt></div>
            ))}
          </dl>
        </section>
      ) : null}

      <section id="direct" className="mx-auto mt-20 max-w-6xl scroll-mt-20 px-5">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-red">● En direct</p><h2 className="mt-1 text-3xl font-extrabold text-navy">Matchs en direct</h2></div>
          <Link to="/connexion" className="text-sm font-semibold text-brand-blue hover:underline">Statistiques détaillées avec un compte ›</Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><MatchsEnDirect /></div>
      </section>

      <section id="metiers" className="mx-auto mt-24 max-w-6xl scroll-mt-20 px-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-blue">Pour chaque métier</p>
        <h2 className="mt-1 max-w-2xl text-3xl font-extrabold text-navy">SYSCOUT-HT s'adapte à chaque métier du football haïtien</h2>
        <div role="tablist" aria-label="Métiers" className="mt-8 flex flex-wrap gap-2">
          {METIERS.map((x, i) => (
            <button key={x.nom} role="tab" aria-selected={i === metier} onClick={() => setMetier(i)}
              className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${i === metier ? 'border-navy bg-navy text-white' : 'border-slate-300 text-slate-600 hover:border-navy hover:text-navy'}`}>{x.nom}</button>
          ))}
        </div>
        <div className="mt-6 grid items-center gap-8 rounded-3xl bg-navy p-8 text-white md:grid-cols-5 md:p-12">
          <div className="md:col-span-3">
            <h3 className="text-2xl font-extrabold md:text-3xl">{m.titre}</h3>
            <ul className="mt-6 space-y-4">
              {m.points.map((p) => <li key={p} className="flex gap-3 text-white/80"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-green" />{p}</li>)}
            </ul>
            <Link to="/inscription" className="mt-8 inline-block rounded-xl bg-brand-green px-6 py-3 text-sm font-bold text-navy hover:brightness-95">Commencer</Link>
          </div>
          <div className="grid place-items-center md:col-span-2"><span className="grid h-40 w-40 place-items-center rounded-full bg-white/10 text-7xl" aria-hidden="true">{m.icone}</span></div>
        </div>
      </section>

      <section id="apercu" className="mx-auto mt-24 max-w-6xl scroll-mt-20 px-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-blue">Aperçu</p>
        <h2 className="mt-1 text-3xl font-extrabold text-navy">Le produit, tel qu'il est</h2>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div role="tablist" aria-label="Aperçus" className="space-y-2">
              {APERCU.map((x, i) => (
                <button key={x.id} role="tab" aria-selected={i === apercu} onClick={() => setApercu(i)}
                  className={`w-full rounded-xl border p-4 text-left transition ${i === apercu ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className={`block font-bold ${i === apercu ? 'text-brand-blue' : 'text-navy'}`}>{x.nom}</span>
                  {i === apercu ? <span className="mt-1 block text-sm text-slate-600">{x.texte}</span> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xl shadow-slate-900/10 lg:col-span-3">
            <div className="flex items-center gap-1.5 border-b border-white/10 bg-slate-800 px-4 py-2.5" aria-hidden="true"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
            <img key={a.id} src={a.image} alt={`Écran « ${a.nom} » de SYSCOUT-HT`} className="aspect-[4/3] w-full object-cover object-top" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-6xl px-5">
        <div className="grid gap-5 md:grid-cols-3">
          {PRINCIPES.map(([t, d, couleur]) => (
            <article key={t} className="rounded-2xl border border-slate-200 p-6">
              <span className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold ${couleur}`}>Principe</span>
              <h3 className="text-lg font-bold text-navy">{t}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p>
            </article>
          ))}
        </div>
      </section>

      {c?.clubs?.length ? (
        <section className="mx-auto mt-24 max-w-6xl px-5">
          <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Les clubs suivis sur la plateforme</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {c.clubs.map((k: any) => (
              <span key={`${k.nom}-${k.ville}`} className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-4 text-sm shadow-sm">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-[10px] font-extrabold text-white">{(k.sigle || k.nom.slice(0, 3)).toUpperCase()}</span>
                <span className="font-semibold text-navy">{k.nom}</span><span className="text-slate-400">{k.ville}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {formules.donnees?.length ? (
        <section id="formules" className="mx-auto mt-24 max-w-6xl scroll-mt-20 px-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-blue">Offres</p>
          <h2 className="mt-1 text-3xl font-extrabold text-navy">Formules d'abonnement</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {formules.donnees.map((f, i) => (
              <div key={f.id} className={`relative rounded-2xl border p-7 ${i === 1 ? 'border-navy bg-navy text-white shadow-2xl' : 'border-slate-200 bg-white'}`}>
                {i === 1 ? <span className="absolute -top-3 left-7 rounded-full bg-brand-green px-3 py-1 text-xs font-bold text-navy">Le plus choisi</span> : null}
                <h3 className="text-lg font-bold">{f.nom}</h3>
                <p className="mt-3 text-4xl font-extrabold">{Number(f.prix_mensuel_htg).toLocaleString('fr-FR')} <span className={`text-base font-medium ${i === 1 ? 'text-white/60' : 'text-slate-400'}`}>HTG / mois</span></p>
                <ul className={`mt-5 space-y-2 text-sm ${i === 1 ? 'text-white/80' : 'text-slate-600'}`}>
                  <li>✓ {f.nombre_comptes} compte(s)</li>
                  <li>✓ {f.rapports_inclus ? 'Rapports de scouting inclus' : 'Rapports en option'}</li>
                </ul>
                <Link to="/inscription" className={`mt-7 block rounded-xl py-3 text-center text-sm font-bold ${i === 1 ? 'bg-brand-green text-navy' : 'bg-navy text-white'}`}>Choisir cette formule</Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-24 bg-gradient-to-r from-navy to-navy-600 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 md:flex-row md:items-center">
          <div><h2 className="text-3xl font-extrabold">Prêt à analyser votre prochain match ?</h2><p className="mt-2 max-w-xl text-white/70">Créez un compte : un administrateur l'active, puis vous accédez aux joueurs, aux matchs et aux rapports de votre rôle.</p></div>
          <div className="flex gap-3"><Link to="/inscription" className="rounded-xl bg-brand-green px-7 py-3.5 font-bold text-navy hover:brightness-95">Créer un compte</Link><Link to="/connexion" className="rounded-xl border border-white/40 px-7 py-3.5 font-semibold hover:bg-white/10">Se connecter</Link></div>
        </div>
      </section>
      <Pied />
    </div>
  );
}
