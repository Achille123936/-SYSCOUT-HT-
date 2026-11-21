import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Alerte, Bouton, Champ } from '../components/ui';

// CU01 : connexion (blocage du compte après 5 essais échoués, géré par le serveur)
export default function Connexion() {
  const { utilisateur, message, connexion } = useAuth();
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
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
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <form onSubmit={soumettre} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-7 shadow-xl">
        <div><Link to="/" className="text-xs text-slate-500 hover:underline">‹ Accueil</Link>
          <h1 className="mt-2 text-2xl font-extrabold text-navy">Connexion</h1>
          <p className="text-sm text-slate-500">SYSCOUT-HT · espace des clubs et des analystes</p></div>
        <Alerte ton="orange">{message}</Alerte>
        <Alerte ton="rouge">{erreur}</Alerte>
        <Champ libelle="Nom d'utilisateur" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="username" autoFocus required />
        <Champ libelle="Mot de passe" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="current-password" required />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.target.checked)} /> Rester connecté sur cet appareil
        </label>
        <Bouton type="submit" className="w-full" disabled={enCours}>{enCours ? 'Connexion…' : 'Se connecter'}</Bouton>
        <p className="text-center text-sm text-slate-500">Pas encore de compte ? <Link className="font-semibold text-brand-blue hover:underline" to="/inscription">Demander un compte</Link></p>
      </form>
    </div>
  );
}
