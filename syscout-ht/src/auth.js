import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, definirJeton, ecouterSessionFermee } from './api';

const CLE = 'syscout.jeton';
const Contexte = createContext(null);

export const useAuth = () => useContext(Contexte);

// CU01 — la session (jeton) est conservée sur l'appareil ; le serveur la ferme après 20 minutes d'inactivité
export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [pret, setPret] = useState(false);
  const [message, setMessage] = useState(null);

  const oublier = useCallback(async (motif = null) => {
    definirJeton(null);
    setUtilisateur(null);
    setMessage(motif);
    await AsyncStorage.removeItem(CLE);
  }, []);

  useEffect(() => {
    ecouterSessionFermee((motif) => oublier(motif));
    (async () => {
      try {
        const jeton = await AsyncStorage.getItem(CLE);
        if (jeton) {
          definirJeton(jeton);
          setUtilisateur(await api.get('/auth/moi/'));
        }
      } catch (e) {
        definirJeton(null);
      } finally {
        setPret(true);
      }
    })();
  }, [oublier]);

  const valeur = useMemo(() => ({
    utilisateur,
    pret,
    message,
    role: utilisateur?.role,
    a: (...roles) => !!utilisateur && roles.includes(utilisateur.role),
    async connexion(nomUtilisateur, motDePasse, seSouvenir) {
      const r = await api.post('/auth/connexion/', { nom_utilisateur: nomUtilisateur, mot_de_passe: motDePasse });
      definirJeton(r.jeton);
      if (seSouvenir) await AsyncStorage.setItem(CLE, r.jeton);
      setMessage(null);
      setUtilisateur(await api.get('/auth/moi/')); // avec la formule d'abonnement pour un club client
    },
    async deconnexion() {
      try { await api.post('/auth/deconnexion/'); } catch (e) { /* la session est fermée de toute façon */ }
      await oublier();
    },
    async rafraichir() {
      setUtilisateur(await api.get('/auth/moi/'));
    },
  }), [utilisateur, pret, message, oublier]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
