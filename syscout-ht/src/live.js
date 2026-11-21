import { useCallback, useEffect, useRef, useState } from 'react';
import { api, jetonActuel } from './api';
import { SERVEUR } from './config';

const ADRESSE_WS = SERVEUR.replace(/^http/, 'ws');
// session fermée, accès refusé, match introuvable : se reconnecter ne changerait rien, l'API en donne la raison
const REFUS = [4401, 4403, 4404];

// Suivi en direct d'un match : le serveur pousse le tableau par WebSocket à chaque changement du codage.
// Tant que le WebSocket est coupé, le tableau est relu toutes les 5 secondes, et la connexion se rétablit seule.
// Renvoie l'état attendu par <Etat> (donnees, erreur, enCours, recharger) et `connexion` : 'attente', 'direct' ou 'releve'.
export function useDirect(id) {
  const [etat, setEtat] = useState({ donnees: null, erreur: null, enCours: true });
  const [connexion, setConnexion] = useState('attente');
  const dernierPousse = useRef(0);

  const relire = useCallback(async () => {
    const debut = Date.now();
    try {
      const donnees = await api.get(`/matchs/${id}/direct/`);
      // une réponse partie avant le dernier message poussé est plus ancienne que lui
      if (dernierPousse.current <= debut) setEtat({ donnees, erreur: null, enCours: false });
    } catch (e) {
      setEtat((p) => ({ donnees: p.donnees, erreur: e.message, enCours: false }));
    }
  }, [id]);

  useEffect(() => {
    let fini = false;
    let ws = null;
    let essais = 0;
    let reprise = null;
    let releve = null;
    let battement = null;
    const vus = []; // identifiants des derniers messages : un doublon après reconnexion est ignoré
    const relever = (actif) => { clearInterval(releve); releve = actif ? setInterval(relire, 5000) : null; };

    const ouvrir = () => {
      if (fini) return;
      ws = new WebSocket(`${ADRESSE_WS}/ws/matches/${id}/live/`);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', jeton: jetonActuel() }));
        // garde la session ouverte tant que l'écran suit le match (fermée après 20 minutes d'inactivité)
        battement = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })), 60000);
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.type === 'match.snapshot') { essais = 0; setConnexion('direct'); relever(false); }
        if (!m.tableau || vus.includes(m.id)) return;
        vus.push(m.id);
        if (vus.length > 100) vus.shift();
        dernierPousse.current = Date.now();
        setEtat({ donnees: m.tableau, erreur: null, enCours: false });
      };
      ws.onclose = (e) => {
        clearInterval(battement);
        if (fini) return;
        setConnexion('releve');
        relever(true);
        if (REFUS.includes(e.code)) { relire(); return; }
        reprise = setTimeout(ouvrir, Math.min(30000, 1000 * 2 ** essais++));
      };
    };

    relire();
    ouvrir();
    return () => {
      fini = true;
      clearTimeout(reprise);
      clearInterval(releve);
      clearInterval(battement);
      if (ws) ws.close();
    };
  }, [id, relire]);

  return { ...etat, recharger: relire, connexion };
}
