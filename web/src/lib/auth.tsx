import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, definirJeton, ecouterSessionFermee, jetonMemorise, memoriserJeton } from './api';

export interface Utilisateur {
  id: number; nom_utilisateur: string; prenom: string; nom: string; role: string; role_libelle: string;
  abonnement?: unknown; [cle: string]: any;
}

interface Contexte {
  utilisateur: Utilisateur | null;
  pret: boolean;
  message: string | null;
  a: (...roles: string[]) => boolean;
  connexion: (nom: string, motDePasse: string, seSouvenir: boolean) => Promise<void>;
  deconnexion: () => Promise<void>;
  rafraichir: () => Promise<void>;
}

const Ctx = createContext<Contexte | null>(null);
export const useAuth = () => useContext(Ctx) as Contexte;

// CU01 : la session (jeton) est conservée si l'utilisateur coche « Rester connecté » ; le serveur la ferme après
// 20 minutes d'inactivité.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [pret, setPret] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const oublier = useCallback((motif: string | null = null) => {
    definirJeton(null); memoriserJeton(null, false);
    setUtilisateur(null); setMessage(motif);
  }, []);

  useEffect(() => {
    ecouterSessionFermee((motif) => oublier(motif));
    (async () => {
      try {
        const jeton = jetonMemorise();
        if (jeton) { definirJeton(jeton); setUtilisateur(await api.get('/auth/moi/')); }
      } catch { definirJeton(null); } finally { setPret(true); }
    })();
  }, [oublier]);

  const valeur = useMemo<Contexte>(() => ({
    utilisateur, pret, message,
    a: (...roles) => !!utilisateur && roles.includes(utilisateur.role),
    async connexion(nom, motDePasse, seSouvenir) {
      const r = await api.post('/auth/connexion/', { nom_utilisateur: nom, mot_de_passe: motDePasse });
      definirJeton(r.jeton); memoriserJeton(r.jeton, seSouvenir);
      setMessage(null);
      setUtilisateur(await api.get('/auth/moi/'));
    },
    async deconnexion() {
      try { await api.post('/auth/deconnexion/'); } catch { /* la session est fermée de toute façon */ }
      oublier();
    },
    async rafraichir() { setUtilisateur(await api.get('/auth/moi/')); },
  }), [utilisateur, pret, message, oublier]);

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}
