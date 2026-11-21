import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SERVEUR, api, jetonActuel } from '../lib/api';
import { TYPES_ACTION } from '../lib/format';
import { useIntervalle } from '../lib/hooks';
import { Alerte, Badge, Card, Chargement, Titre } from '../components/ui';

const ADRESSE_WS = SERVEUR.replace(/^http/, 'ws'); // https devient wss
const COMPARAISON: [string, string][] = [
  ['buts', 'Buts'], ['tirs', 'Tirs'], ['tirs_cadres', 'Tirs cadrés'], ['xg', 'xG'], ['passes', 'Passes'],
  ['passes_reussies_pct', 'Passes réussies %'], ['duels_gagnes_pct', 'Duels gagnés %'], ['recuperations', 'Récupérations'],
  ['interceptions', 'Interceptions'], ['fautes', 'Fautes'], ['cartons', 'Cartons'], ['corners', 'Corners'], ['hors_jeux', 'Hors-jeu'], ['arrets', 'Arrêts'],
];

type Etat = 'connexion' | 'direct' | 'secours';

// Direct : WebSocket /ws/matches/{id}/live/ (jeton dans le premier message, jamais dans l'adresse) ; sans WebSocket,
// le tableau est relu toutes les 5 secondes. Un message déjà reçu (même id) est ignoré après une reconnexion.
export default function Direct() {
  const { id } = useParams();
  const [tableau, setTableau] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat>('connexion');
  const vus = useRef(new Set<string>());

  const relire = () => api.get(`/matchs/${id}/direct/`).then((t) => { setTableau(t); setErreur(null); }).catch((e) => setErreur(e.message));

  useEffect(() => {
    let ws: WebSocket | null = null, ferme = false, essai = 0, minuteur: ReturnType<typeof setTimeout>;
    relire();
    const ouvrir = () => {
      ws = new WebSocket(`${ADRESSE_WS}/ws/matches/${id}/live/`);
      ws.onopen = () => { essai = 0; ws?.send(JSON.stringify({ type: 'auth', jeton: jetonActuel() })); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'pong') return;
        if (m.id) { if (vus.current.has(m.id)) return; vus.current.add(m.id); }
        if (m.tableau) { setTableau(m.tableau); setErreur(null); setEtat('direct'); }
      };
      ws.onclose = (e) => {
        setEtat('secours');
        if (ferme || [4401, 4403, 4404].includes(e.code)) return; // non identifié, accès refusé, match introuvable
        minuteur = setTimeout(ouvrir, Math.min(30000, 1000 * 2 ** essai++));
      };
    };
    ouvrir();
    const ping = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 60000);
    return () => { ferme = true; clearTimeout(minuteur); clearInterval(ping); ws?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useIntervalle(() => { if (etat !== 'direct') relire(); }, 5000);

  if (!tableau) return erreur ? <Alerte ton="rouge">{erreur}</Alerte> : <Chargement />;
  const m = tableau.match, eq = tableau.equipes;
  return (
    <>
      <Titre titre={`${m.domicile.nom} ${tableau.score[0]} – ${tableau.score[1]} ${m.exterieur.nom}`}
        sous={<span className="inline-flex items-center gap-2">
          {tableau.en_direct ? <Badge ton="rouge">● EN DIRECT · {tableau.minute}'</Badge> : <Badge>{m.etat_libelle}</Badge>}
          <Badge ton={etat === 'direct' ? 'vert' : 'orange'}>{etat === 'direct' ? 'Temps réel' : 'Actualisation toutes les 5 s'}</Badge>
          <Link to={`/app/matchs/${m.id}`} className="text-brand-blue hover:underline">Fiche du match</Link></span>} />
      <div className="space-y-6">
        <Alerte ton="rouge">{erreur}</Alerte>
        {tableau.propositions.en_attente ? <Alerte ton="bleu">{tableau.propositions.en_attente} proposition(s) de l'IA attendent la décision de l'analyste : elles ne comptent pas encore dans les chiffres.</Alerte> : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card titre="Comparaison des équipes">
            <table className="w-full text-sm">
              <thead><tr className="text-xs uppercase text-slate-500"><th className="w-1/3 text-right">{m.domicile.sigle || m.domicile.nom}</th><th /><th className="w-1/3 text-left">{m.exterieur.sigle || m.exterieur.nom}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARAISON.map(([cle, nom]) => (
                  <tr key={cle}><td className="py-2 text-right font-bold text-navy">{eq.domicile[cle] ?? '—'}</td><td className="py-2 text-center text-slate-500">{nom}</td><td className="py-2 font-bold text-navy">{eq.exterieur[cle] ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">Sources : {tableau.sources.analyste} saisie(s) de l'analyste · {tableau.sources.ia_confirmes} IA confirmée(s) · {tableau.sources.ia_corriges} IA corrigée(s).</p>
          </Card>
          <Card titre="Dernières actions">
            {tableau.derniers.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {tableau.derniers.map((e: any) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <span className="w-9 text-right font-bold text-slate-400">{e.minute}'</span>
                    <span className="flex-1"><span className="font-medium text-navy">{TYPES_ACTION[e.type_action] || e.type_action}</span> <span className="text-slate-500">{e.joueur_nom}</span></span>
                    {e.source === 'AI' ? <Badge ton="bleu">IA</Badge> : null}
                    <Badge ton={e.resultat ? 'vert' : 'gris'}>{e.resultat ? 'Réussie' : 'Ratée'}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Aucune action codée pour le moment.</p>}
          </Card>
        </div>
        {tableau.cameras.length ? (
          <Card titre="Caméras du match">
            <ul className="space-y-2 text-sm">{tableau.cameras.map((c: any) => (
              <li key={c.id} className="flex items-center gap-3"><span className="font-medium">{c.nom}</span><Badge ton={c.etat === 'EN_LIGNE' ? 'vert' : 'rouge'}>{c.etat_libelle}</Badge>
                {c.latence_ms != null ? <span className="text-slate-400">{c.latence_ms} ms</span> : null}</li>))}</ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
