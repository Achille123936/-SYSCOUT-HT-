import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alerte, Bouton, Card, Champ, Titre } from '../components/ui';

// Demande d'inscription : le compte est créé inactif, l'administrateur l'active et lui attribue son rôle.
export function Inscription() {
  const { utilisateur } = useAuth();
  const [f, setF] = useState({ prenom: '', nom: '', courriel: '', telephone: '', nom_utilisateur: '', mot_de_passe: '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  if (utilisateur) return <Navigate to="/app" replace />;
  const maj = (k: string, v: string) => setF({ ...f, [k]: v });
  const envoyer = async (e: FormEvent) => {
    e.preventDefault(); setErreur(null);
    try { await api.post('/auth/inscription/', f); setFait(true); } catch (x) { setErreur((x as Error).message); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        <Link to="/connexion" className="text-xs text-slate-500 hover:underline">‹ Connexion</Link>
        <h1 className="mt-2 text-2xl font-extrabold text-navy">Demande d'inscription</h1>
        {fait ? <div className="mt-4"><Alerte ton="vert">Demande envoyée. L'administrateur doit l'activer avant que vous puissiez vous connecter.</Alerte></div> : (
          <form onSubmit={envoyer} className="mt-4 space-y-3">
            <Alerte ton="rouge">{erreur}</Alerte>
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Prénom" value={f.prenom} onChange={(e) => maj('prenom', e.target.value)} required /><Champ libelle="Nom" value={f.nom} onChange={(e) => maj('nom', e.target.value)} required /></div>
            <Champ libelle="Courriel" type="email" value={f.courriel} onChange={(e) => maj('courriel', e.target.value)} required />
            <Champ libelle="Téléphone" value={f.telephone} onChange={(e) => maj('telephone', e.target.value)} />
            <Champ libelle="Nom d'utilisateur" value={f.nom_utilisateur} onChange={(e) => maj('nom_utilisateur', e.target.value)} required />
            <Champ libelle="Mot de passe" type="password" value={f.mot_de_passe} onChange={(e) => maj('mot_de_passe', e.target.value)} required autoComplete="new-password" />
            <Bouton type="submit" className="w-full">Envoyer la demande</Bouton>
          </form>)}
      </div>
    </div>
  );
}

// Changement de mot de passe de l'utilisateur connecté, et fiche personnelle
export function MonCompte() {
  const { utilisateur, deconnexion } = useAuth();
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const changer = async (e: FormEvent) => {
    e.preventDefault(); setErreur(null); setOk(false);
    try { await api.post('/auth/mot-de-passe/', { ancien, nouveau }); setOk(true); setAncien(''); setNouveau(''); } catch (x) { setErreur((x as Error).message); }
  };
  return (
    <>
      <Titre titre="Mon compte" sous={`${utilisateur?.nom_complet || ''} · ${utilisateur?.role_libelle}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card titre="Mes informations"><dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Nom d'utilisateur</dt><dd className="font-medium">{utilisateur?.nom_utilisateur}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Courriel</dt><dd className="font-medium">{utilisateur?.courriel || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Club</dt><dd className="font-medium">{utilisateur?.club_nom || '—'}</dd></div></dl>
          {utilisateur?.joueur ? <Link to={`/app/joueurs/${utilisateur.joueur}`} className="mt-4 inline-block text-sm text-brand-blue hover:underline">Ma fiche joueur ›</Link> : null}
          <div className="mt-4"><Bouton genre="secondaire" onClick={deconnexion}>Déconnexion</Bouton></div></Card>
        <Card titre="Changer le mot de passe">
          <form onSubmit={changer} className="space-y-3">
            <Alerte ton="rouge">{erreur}</Alerte>{ok ? <Alerte ton="vert">Mot de passe modifié.</Alerte> : null}
            <Champ libelle="Mot de passe actuel" type="password" value={ancien} onChange={(e) => setAncien(e.target.value)} autoComplete="current-password" required />
            <Champ libelle="Nouveau mot de passe" type="password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} autoComplete="new-password" required />
            <Bouton type="submit">Modifier</Bouton></form></Card>
      </div>
    </>
  );
}
