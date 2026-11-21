import { useCallback, useEffect, useRef, useState } from 'react';

export interface Chargement<T> { donnees: T | null; erreur: string | null; enCours: boolean; recharger: () => Promise<void> }

/** Charge des données au montage et quand `dependances` change ; `charger` peut renvoyer null pour ne rien faire. */
export function useChargement<T>(charger: () => Promise<T> | null, dependances: unknown[] = []): Chargement<T> {
  const [etat, setEtat] = useState<{ donnees: T | null; erreur: string | null; enCours: boolean }>({ donnees: null, erreur: null, enCours: true });
  const courant = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recharger = useCallback(async () => {
    const rang = ++courant.current;
    const promesse = charger();
    if (!promesse) { setEtat({ donnees: null, erreur: null, enCours: false }); return; }
    setEtat((e) => ({ ...e, enCours: true }));
    try {
      const donnees = await promesse;
      if (rang === courant.current) setEtat({ donnees, erreur: null, enCours: false });
    } catch (e) {
      if (rang === courant.current) setEtat((s) => ({ donnees: s.donnees, erreur: (e as Error).message, enCours: false }));
    }
  }, dependances);
  useEffect(() => { recharger(); }, [recharger]);
  return { ...etat, recharger };
}

/** Exécute `rappel` toutes les `ms` millisecondes tant que le composant est affiché. */
export function useIntervalle(rappel: () => void, ms: number) {
  const ref = useRef(rappel);
  ref.current = rappel;
  useEffect(() => { const t = setInterval(() => ref.current(), ms); return () => clearInterval(t); }, [ms]);
}
