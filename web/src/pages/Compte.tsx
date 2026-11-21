import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alerte, Bouton, Card, Champ, Titre } from '../components/ui';

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
