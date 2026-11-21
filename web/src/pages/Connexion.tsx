import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import PanneauAuth from '../components/PanneauAuth';
import Pied from '../components/Pied';
import { Alerte, Bouton, Champ } from '../components/ui';

const AVANTAGES: [string, string][] = [
  ['Vos matchs et vos joueurs', 'Statistiques, direct, codage vidéo et rapports selon votre rôle.'],
  ['Données vérifiées', "L'IA propose, l'analyste décide : rien de non vérifié n'est présenté comme officiel."],
  ['Sécurisé', 'Session fermée après 20 minutes d’inactivité, compte protégé après 5 essais échoués.'],
];

// CU01 : connexion (blocage du compte après 5 essais échoués, géré par le serveur)
export default function Connexion() {
  const { utilisateur, message, connexion } = useAuth();
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voir, setVoir] = useState(false);
  const [souvenir, setSouvenir] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const navigate = useNavigate();
  const lieu = useLocation();

  if (utilisateur) return <Navigate to="/app" replace />;
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null); setEnCours(true);
    try {
      await connexion(nom.trim(), motDePasse, souvenir);
      navigate((lieu.state as { de?: string } | null)?.de || '/app', { replace: true });
    } catch (x) { setErreur((x as Error).message); } finally { setEnCours(false); }
  };

  return (
    <>
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <PanneauAuth titre="Content de vous revoir." avantages={AVANTAGES} />
      <main className="flex items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 block text-lg font-extrabold text-navy lg:hidden">SYSCOUT<span className="text-brand-green">-HT</span></Link>
          <h1 className="text-3xl font-extrabold text-navy">Connexion</h1>
          <p className="mt-1 text-sm text-slate-500">Pas encore de compte ? <Link className="font-semibold text-brand-blue hover:underline" to="/inscription">Demander un compte</Link></p>
          <form onSubmit={soumettre} className="mt-8 space-y-4">
            <Alerte ton="orange">{message}</Alerte>
            <Alerte ton="rouge">{erreur}</Alerte>
            <Champ libelle="Nom d'utilisateur" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="username" autoFocus required />
            <Champ libelle="Mot de passe" type={voir ? 'text' : 'password'} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="current-password" required />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <label className="flex items-center gap-2"><input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.target.checked)} /> Rester connecté</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={voir} onChange={(e) => setVoir(e.target.checked)} /> Afficher le mot de passe</label>
            </div>
            <Bouton type="submit" className="w-full py-3" disabled={enCours}>{enCours ? 'Connexion…' : 'Se connecter'}</Bouton>
          </form>
          <p className="mt-6 text-xs text-slate-400">Mot de passe oublié ? Contactez l'administrateur : il peut le réinitialiser.</p>
        </div>
      </main>
    </div>
    <Pied />
    </>
  );
}
