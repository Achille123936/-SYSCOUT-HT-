import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import fond from '../assets/accueil-fond.jpg';
import { Alerte, Bouton, Champ } from '../components/ui';

const AVANTAGES: [string, string][] = [
  ['Des matchs codés action par action', 'Statistiques, centiles et indice de performance pour chaque joueur.'],
  ["L'IA propose, vous décidez", 'Chaque donnée vient de votre analyste ou est vérifiée par lui.'],
  ['Des rapports qui font foi', 'Scouting, comparaison de joueurs, export PDF.'],
];
const ETAPES = ['Identité', 'Contact', 'Compte'];

/** Force d'un mot de passe : le serveur exige 8 caractères au moins, avec des lettres et des chiffres. */
function force(mdp: string) {
  const criteres = [mdp.length >= 8, /[a-zA-Z]/.test(mdp) && /\d/.test(mdp), mdp.length >= 12, /[^a-zA-Z0-9]/.test(mdp) && /[A-Z]/.test(mdp)];
  const n = criteres.filter(Boolean).length;
  return { n, acceptable: criteres[0] && criteres[1], libelle: ['Trop court', 'Faible', 'Correct', 'Bon', 'Excellent'][n] };
}

// Demande d'inscription en trois étapes : le compte est créé inactif, l'administrateur l'active et lui attribue son rôle.
export default function Inscription() {
  const { utilisateur } = useAuth();
  const [etape, setEtape] = useState(0);
  const [f, setF] = useState({ prenom: '', nom: '', courriel: '', telephone: '', nom_utilisateur: '', mot_de_passe: '', confirmation: '' });
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [voir, setVoir] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  if (utilisateur) return <Navigate to="/app" replace />;
  const maj = (k: string, v: string) => { setF({ ...f, [k]: v }); setChamps((c) => ({ ...c, [k]: '' })); };
  const fm = force(f.mot_de_passe);

  const verifier = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (etape === 0) {
      if (!f.prenom.trim()) e.prenom = 'Indiquez votre prénom.';
      if (!f.nom.trim()) e.nom = 'Indiquez votre nom.';
    }
    if (etape === 1 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.courriel)) e.courriel = 'Adresse courriel invalide.';
    if (etape === 2) {
      if (f.nom_utilisateur.trim().length < 3) e.nom_utilisateur = 'Au moins 3 caractères.';
      if (!fm.acceptable) e.mot_de_passe = 'Au moins 8 caractères, avec des lettres et des chiffres.';
      if (f.confirmation !== f.mot_de_passe) e.confirmation = 'Les deux mots de passe diffèrent.';
    }
    return e;
  };

  const suivant = async (ev: FormEvent) => {
    ev.preventDefault();
    setErreur(null);
    const e = verifier();
    setChamps(e);
    if (Object.keys(e).length) return;
    if (etape < 2) return setEtape(etape + 1);
    setEnvoi(true);
    try {
      const { confirmation: _c, ...corps } = f;
      await api.post('/auth/inscription/', { ...corps, prenom: corps.prenom.trim(), nom: corps.nom.trim(), nom_utilisateur: corps.nom_utilisateur.trim() });
      setFait(true);
    } catch (x: any) {
      const serveur: Record<string, string> = x.champs || {};
      setChamps(serveur);
      setErreur(x.message);
      const cles = Object.keys(serveur);
      setEtape(cles.some((k) => ['prenom', 'nom'].includes(k)) ? 0 : cles.some((k) => ['courriel', 'telephone'].includes(k)) ? 1 : 2);
    } finally { setEnvoi(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative isolate hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between">
        <img src={fond} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/95 via-navy/80 to-navy" />
        <div className="p-12"><Link to="/" className="text-lg font-extrabold">SYSCOUT<span className="text-brand-green">-HT</span></Link></div>
        <div className="p-12 pb-16">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-green">Ligue Haïtienne</p>
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">Rejoignez la plateforme du football haïtien.</h2>
          <ul className="mt-8 max-w-md space-y-5">
            {AVANTAGES.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-green text-[11px] font-black text-navy">✓</span>
                <span><span className="block font-semibold">{t}</span><span className="text-sm text-white/65">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="h-1.5 w-full bg-gradient-to-r from-[#00209F] to-[#D21034]" aria-hidden="true" />
      </aside>

      <main className="flex items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 block text-lg font-extrabold text-navy lg:hidden">SYSCOUT<span className="text-brand-green">-HT</span></Link>
          {fait ? (
            <div role="status" className="text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-3xl text-brand-green">✓</span>
              <h1 className="mt-5 text-2xl font-extrabold text-navy">Demande envoyée</h1>
              <p className="mt-2 text-sm text-slate-600">Merci {f.prenom}. Un administrateur doit activer votre compte et lui attribuer un rôle avant votre première connexion.</p>
              <ol className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm text-slate-600">
                <li className="flex gap-3"><b className="text-brand-green">1</b>Votre demande est enregistrée.</li>
                <li className="flex gap-3"><b className="text-slate-400">2</b>L'administrateur la vérifie et active le compte.</li>
                <li className="flex gap-3"><b className="text-slate-400">3</b>Vous vous connectez avec « {f.nom_utilisateur} ».</li>
              </ol>
              <Link to="/connexion"><Bouton className="mt-8 w-full">Aller à la connexion</Bouton></Link>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-extrabold text-navy">Créer un compte</h1>
              <p className="mt-1 text-sm text-slate-500">Déjà inscrit ? <Link className="font-semibold text-brand-blue hover:underline" to="/connexion">Se connecter</Link></p>

              <ol className="mt-8 flex items-center" aria-label="Progression">
                {ETAPES.map((nom, i) => (
                  <li key={nom} className="flex flex-1 items-center last:flex-none" aria-current={i === etape ? 'step' : undefined}>
                    <span className="flex items-center gap-2">
                      <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${i < etape ? 'bg-brand-green text-white' : i === etape ? 'bg-navy text-white' : 'bg-slate-100 text-slate-400'}`}>{i < etape ? '✓' : i + 1}</span>
                      <span className={`hidden text-sm font-medium sm:inline ${i === etape ? 'text-navy' : 'text-slate-400'}`}>{nom}</span>
                    </span>
                    {i < ETAPES.length - 1 ? <span className={`mx-3 h-px flex-1 ${i < etape ? 'bg-brand-green' : 'bg-slate-200'}`} /> : null}
                  </li>
                ))}
              </ol>

              <form onSubmit={suivant} className="mt-8 space-y-4" noValidate>
                <Alerte ton="rouge">{erreur}</Alerte>
                {etape === 0 ? (<>
                  <Champ libelle="Prénom" value={f.prenom} onChange={(e) => maj('prenom', e.target.value)} erreur={champs.prenom} autoFocus autoComplete="given-name" />
                  <Champ libelle="Nom" value={f.nom} onChange={(e) => maj('nom', e.target.value)} erreur={champs.nom} autoComplete="family-name" />
                </>) : null}
                {etape === 1 ? (<>
                  <Champ libelle="Courriel" type="email" value={f.courriel} onChange={(e) => maj('courriel', e.target.value)} erreur={champs.courriel} autoFocus autoComplete="email" />
                  <Champ libelle="Téléphone (facultatif)" type="tel" value={f.telephone} onChange={(e) => maj('telephone', e.target.value)} erreur={champs.telephone} autoComplete="tel" placeholder="+509 …" />
                  <p className="text-xs text-slate-500">Votre courriel sert à vous transmettre les informations de votre compte.</p>
                </>) : null}
                {etape === 2 ? (<>
                  <Champ libelle="Nom d'utilisateur" value={f.nom_utilisateur} onChange={(e) => maj('nom_utilisateur', e.target.value)} erreur={champs.nom_utilisateur} autoFocus autoComplete="username" />
                  <div>
                    <Champ libelle="Mot de passe" type={voir ? 'text' : 'password'} value={f.mot_de_passe} onChange={(e) => maj('mot_de_passe', e.target.value)} erreur={champs.mot_de_passe} autoComplete="new-password" />
                    <div className="mt-2 flex items-center gap-2" aria-live="polite">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${f.mot_de_passe && i <= fm.n ? (fm.n <= 1 ? 'bg-brand-red' : fm.n === 2 ? 'bg-brand-orange' : 'bg-brand-green') : 'bg-slate-200'}`} />)}
                      </div>
                      <span className="w-20 text-right text-xs text-slate-500">{f.mot_de_passe ? fm.libelle : ''}</span>
                    </div>
                  </div>
                  <Champ libelle="Confirmer le mot de passe" type={voir ? 'text' : 'password'} value={f.confirmation} onChange={(e) => maj('confirmation', e.target.value)} erreur={champs.confirmation} autoComplete="new-password" />
                  <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={voir} onChange={(e) => setVoir(e.target.checked)} /> Afficher les mots de passe</label>
                </>) : null}
                <div className="flex gap-3 pt-2">
                  {etape > 0 ? <Bouton type="button" genre="secondaire" onClick={() => { setErreur(null); setChamps({}); setEtape(etape - 1); }}>Retour</Bouton> : null}
                  <Bouton type="submit" className="flex-1" disabled={envoi}>{etape < 2 ? 'Continuer' : envoi ? 'Envoi…' : 'Envoyer la demande'}</Bouton>
                </div>
              </form>
              <p className="mt-6 text-xs text-slate-400">Étape {etape + 1} sur 3 · Aucun compte n'est actif avant la validation d'un administrateur.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
