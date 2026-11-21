import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, exporterPdf } from '../lib/api';
import { LIGNES_STATS, TYPES_ACTION, dateFR, nombre } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Radar from '../components/Radar';
import { Alerte, Chargement } from '../components/ui';
import { BoutonAzur, Disque, Info, Lecture, Onglets, Panneau, TerrainVert, type Part } from './ScoutUI';

const CATEGORIES: { nom: string; types: string[]; couleur: string }[] = [
  { nom: 'Individuel', types: ['DRIBBLE', 'DUEL'], couleur: '#1E6FD9' },
  { nom: 'Finition', types: ['TIR', 'BUT'], couleur: '#3F51B5' },
  { nom: 'Défense', types: ['INTERCEPTION', 'RECUPERATION'], couleur: '#E04B3E' },
  { nom: 'Passes', types: ['PASSE', 'CENTRE'], couleur: '#F7C21F' },
  { nom: 'Autres', types: ['FAUTE', 'CARTON'], couleur: '#E8731A' },
];
const VIDEOS: [string, string][] = [['PASSE', 'Passes'], ['CENTRE', 'Centres'], ['DRIBBLE', 'Dribbles'], ['DUEL', 'Duels'], ['TIR', 'Tirs'], ['BUT', 'Buts'], ['INTERCEPTION', 'Interceptions'], ['RECUPERATION', 'Récupérations'], ['FAUTE', 'Fautes'], ['CARTON', 'Cartons']];

// Interface 1 — fiche d'un joueur : informations, statistiques, vidéos par type d'action, compétitions, derniers matchs.
export default function ScoutJoueur() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const onglet = params.get('onglet') || 'overview';
  const fiche = useChargement<any>(() => api.get(`/joueurs/${id}/radar/`), [id]);
  const carte = useChargement<any>(() => api.get(`/joueurs/${id}/carte/`), [id]);
  const journal = useChargement<any>(() => api.get(`/joueurs/${id}/matchs/`), [id]);
  const rapports = useChargement<any[]>(() => (onglet === 'rapports' ? api.tout('/rapports/').then((r) => r.filter((x: any) => String(x.joueur) === id)) : null), [id, onglet]);

  const actions: any[] = carte.donnees?.actions || [];
  const parType = useMemo(() => {
    const m: Record<string, { total: number; reussies: number }> = {};
    actions.forEach((a) => { const e = (m[a.type_action] ||= { total: 0, reussies: 0 }); e.total += 1; if (a.resultat) e.reussies += 1; });
    return m;
  }, [actions]);
  const parts: Part[] = CATEGORIES.map((c) => ({ nom: c.nom, couleur: c.couleur, valeur: c.types.reduce((s, t) => s + (parType[t]?.total || 0), 0) }));
  const moyenne = actions.length ? { x: actions.reduce((s, a) => s + a.zone_x, 0) / actions.length, y: actions.reduce((s, a) => s + a.zone_y, 0) / actions.length } : null;

  if (fiche.erreur && !fiche.donnees) return <div className="mx-auto max-w-[1400px] p-4"><Alerte ton="rouge">{fiche.erreur}</Alerte></div>;
  if (!fiche.donnees) return <div className="p-6"><Chargement /></div>;
  const d = fiche.donnees, j = d.joueur, s = d.statistique;
  const contrat = d.historique?.find((h: any) => !h.date_fin);
  const annee = j.date_naissance ? String(j.date_naissance).slice(2, 4) : '';
  const cartons = parType.CARTON?.total || 0;
  const matchs: any[] = journal.donnees?.matchs || [];
  const base = `/scout/joueur/${id}`;
  const onglets = [
    { id: 'overview', libelle: 'Overview', vers: base }, { id: 'matchs', libelle: 'Full matches', vers: `/scout/matchs?joueur=${id}` },
    { id: 'evenements', libelle: 'Events', vers: `${base}?onglet=evenements` }, { id: 'stats', libelle: 'Stats', vers: `${base}?onglet=stats` },
    { id: 'carriere', libelle: 'Career', vers: `${base}?onglet=carriere` }, { id: 'rapports', libelle: 'Reports', vers: `${base}?onglet=rapports` },
    { id: 'scouting', libelle: 'Scouting', vers: `${base}?onglet=scouting` },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex items-center gap-3 border-b border-wy-bord bg-white px-4 py-2">
        <button onClick={() => navigate(-1)} className="px-1 text-lg text-wy-doux hover:text-wy-bleu" aria-label="Retour">‹</button>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-wy-fond text-[13px] font-bold text-wy-bleu" aria-hidden="true">{j.prenom?.[0]}{j.nom?.[0]}</span>
        <h1 className="text-[16px] font-bold uppercase text-wy-texte">{j.prenom?.[0]}. {j.nom} <span className="font-normal">('{annee})</span></h1>
        <Link to={`/scout/equipe/${j.club_actuel}`} className="text-[13px] text-wy-bleu hover:underline">{j.club_nom}</Link>
      </div>
      <Onglets onglets={onglets} actif={onglet} />

      <div className="space-y-4 p-4">
        {onglet === 'overview' ? (
          <>
            <div className="grid gap-4 lg:grid-cols-12">
              <Panneau titre="Informations générales" className="lg:col-span-5">
                <div className="flex gap-5">
                  <div className="w-28 shrink-0">
                    <div className="grid h-32 w-24 place-items-center border border-wy-bord bg-wy-fond text-3xl font-extrabold text-wy-azur">{j.prenom?.[0]}{j.nom?.[0]}</div>
                    <dl className="mt-3 text-[12px]"><dt className="font-bold text-wy-bleu">Taille</dt><dd>{j.taille ? `${j.taille} cm` : '—'}</dd><dt className="mt-1 font-bold text-wy-bleu">Poids</dt><dd>{j.poids ? `${j.poids} kg` : '—'}</dd></dl>
                  </div>
                  <dl className="min-w-0 flex-1">
                    <Info libelle="Nom">{j.nom}</Info><Info libelle="Prénom">{j.prenom}</Info>
                    <Info libelle="Naissance">{dateFR(j.date_naissance)} ({j.age} ans)</Info>
                    <Info libelle="Nationalité">{j.nationalite || '—'}</Info>
                    <Info libelle="Poste">{j.poste_libelle}</Info><Info libelle="Pied fort">{{ G: 'Gauche', D: 'Droit', '2': 'Les deux' }[j.pied_fort as string] || '—'}</Info>
                    <div className="mt-3" />
                    <Info libelle="Contrat" orange>{contrat?.type_contrat_libelle || 'Non disponible'}</Info>
                    <Info libelle="Agent" orange>{j.est_mineur ? 'Données protégées (mineur)' : 'Aucune agence'}</Info>
                    <Info libelle="Joue pour" orange><Link className="text-wy-bleu hover:underline" to={`/scout/equipe/${j.club_actuel}`}>{j.club_nom}</Link></Info>
                  </dl>
                </div>
              </Panneau>

              <Panneau titre="Statistiques du joueur" className="lg:col-span-7">
                <div className="grid items-center gap-4 md:grid-cols-12">
                  <dl className="md:col-span-3">
                    <Info libelle="Pied">{{ G: 'gauche', D: 'droit', '2': 'les deux' }[j.pied_fort as string] || '—'}</Info>
                    <Info libelle="Matchs">{s?.matchs_joues ?? 0}</Info>
                    <Info libelle="Min./match">{s?.matchs_joues ? nombre(Math.round((s.minutes_jouees / s.matchs_joues) * 10) / 10) : '—'}</Info>
                    <Info libelle="Buts">{s?.buts ?? 0}</Info>
                    <Info libelle="Buts/match">{s?.matchs_joues ? nombre(Math.round((s.buts / s.matchs_joues) * 100) / 100) : '—'}</Info>
                    <Info libelle="Cartons">{cartons}</Info>
                    <Info libelle="Indice">{s?.indice_performance != null ? `${Math.round(s.indice_performance)}/100` : '—'}</Info>
                  </dl>
                  <div className="md:col-span-5"><Disque parts={parts} /></div>
                  <div className="md:col-span-4"><TerrainVert points={actions.map((a) => ({ x: a.zone_x, y: a.zone_y }))} moyenne={moyenne} />
                    <p className="mt-1 text-center text-[10px] text-wy-doux">Position moyenne et actions codées</p></div>
                </div>
              </Panneau>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              <Panneau titre="Vidéos" className="lg:col-span-5" droite={<Link to={`/scout/matchs?joueur=${id}`}><BoutonAzur>Tous les matchs</BoutonAzur></Link>}>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                  <li className="col-span-2"><Link to={`/scout/matchs?joueur=${id}`} className="flex items-center gap-3 hover:text-wy-bleu"><Lecture />Rapport vidéo automatique</Link></li>
                  {VIDEOS.filter(([t]) => parType[t]).map(([t, nom]) => (
                    <li key={t}><Link to={`/scout/matchs?joueur=${id}&type=${t}`} className="flex items-center gap-3 hover:text-wy-bleu"><Lecture />{nom} <span className="text-wy-doux">({parType[t].total})</span></Link></li>
                  ))}
                </ul>
              </Panneau>

              <div className="space-y-4 lg:col-span-7">
                <Panneau titre="Compétitions en cours">
                  <table className="w-full text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Saison</th><th className="text-left">Équipe</th><th className="text-right">Min.</th><th className="text-right">Matchs</th><th className="text-right">Buts</th><th className="text-right">Passes déc.</th><th className="text-right">Cartons</th></tr></thead>
                    <tbody><tr className="border-b border-wy-bord"><td className="py-2 text-wy-bleu">{d.saison?.libelle}</td><td>{j.club_nom}</td><td className="text-right">{s?.minutes_jouees ?? 0}'</td><td className="text-right">{s?.matchs_joues ?? 0}</td><td className="text-right">{s?.buts ?? 0}</td><td className="text-right">{s?.passes_decisives ?? 0}</td><td className="text-right">{cartons}</td></tr></tbody></table>
                </Panneau>
                <Panneau titre="Derniers matchs">
                  {matchs.length ? (
                    <table className="w-full text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Date</th><th className="text-left">Match</th><th className="text-left">Score</th><th className="text-right">Min.</th><th className="text-right">Buts</th><th className="text-right">Passes %</th></tr></thead>
                      <tbody>{matchs.slice(0, 6).map((m) => (
                        <tr key={m.match} className="border-b border-wy-bord"><td className="py-2 text-wy-bleu">{dateFR(m.date_match)}</td>
                          <td><Link className="hover:text-wy-bleu" to={`/scout/matchs?match=${m.match}&joueur=${id}`}>{m.domicile ? `${j.club_nom} - ${m.adversaire}` : `${m.adversaire} - ${j.club_nom}`}</Link></td>
                          <td>{m.score}</td><td className="text-right">{m.minutes_jouees}'</td><td className="text-right">{m.buts || '–'}</td><td className="text-right">{m.passes_reussies_pct != null ? `${m.passes_reussies_pct}%` : '–'}</td></tr>))}</tbody></table>
                  ) : <p className="text-[13px] text-wy-doux">Aucun match validé cette saison.</p>}
                </Panneau>
              </div>
            </div>
          </>
        ) : null}

        {onglet === 'evenements' ? (
          <Panneau titre="Actions codées de la saison">
            <table className="w-full max-w-xl text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Action</th><th className="text-right">Total</th><th className="text-right">Réussies</th><th className="text-right">%</th><th /></tr></thead>
              <tbody>{Object.entries(parType).sort((a, b) => b[1].total - a[1].total).map(([t, e]) => (
                <tr key={t} className="border-b border-wy-bord"><td className="py-2">{TYPES_ACTION[t] || t}</td><td className="text-right">{e.total}</td><td className="text-right">{e.reussies}</td><td className="text-right">{Math.round((100 * e.reussies) / e.total)}%</td>
                  <td className="pl-4 text-right"><Link to={`/scout/matchs?joueur=${id}&type=${t}`} className="text-wy-bleu hover:underline">Vidéos ›</Link></td></tr>))}</tbody></table>
          </Panneau>
        ) : null}

        {onglet === 'stats' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panneau titre="Radar des centiles"><Radar series={[{ nom: j.nom_complet, couleur: '#29ABE2', centiles: s?.centiles }]} /></Panneau>
            <Panneau titre="Statistiques de la saison">
              {s ? <dl className="text-[13px]">{LIGNES_STATS.map(([cle, nom, unite]) => <div key={cle} className="flex justify-between border-b border-wy-bord py-1.5"><dt className="text-wy-doux">{nom}</dt><dd className="font-semibold">{nombre(s[cle], unite)}</dd></div>)}</dl>
                : <p className="text-[13px] text-wy-doux">Aucune statistique publiée.</p>}
            </Panneau>
          </div>
        ) : null}

        {onglet === 'carriere' ? (
          <Panneau titre="Historique des clubs">
            <table className="w-full max-w-2xl text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Club</th><th className="text-left">Contrat</th><th className="text-left">Du</th><th className="text-left">Au</th></tr></thead>
              <tbody>{d.historique.map((h: any) => <tr key={h.id} className="border-b border-wy-bord"><td className="py-2"><Link className="text-wy-bleu hover:underline" to={`/scout/equipe/${h.club}`}>{h.club_nom}</Link></td><td>{h.type_contrat_libelle}</td><td>{dateFR(h.date_debut)}</td><td>{h.date_fin ? dateFR(h.date_fin) : "aujourd'hui"}</td></tr>)}</tbody></table>
          </Panneau>
        ) : null}

        {onglet === 'rapports' ? (
          <Panneau titre="Rapports de scouting">
            {rapports.donnees?.length ? (
              <ul className="divide-y divide-wy-bord text-[13px]">{rapports.donnees.map((r) => (
                <li key={r.id} className="py-3"><p className="font-semibold">{r.note}/10 · {r.recommandation_libelle} <span className="font-normal text-wy-doux">· {r.scout_nom} · {dateFR(r.date_rapport)} · {r.etat_libelle}</span></p><p className="mt-1 text-wy-doux">{r.forces}</p></li>))}</ul>
            ) : <p className="text-[13px] text-wy-doux">{rapports.enCours ? 'Chargement…' : 'Aucun rapport visible pour ce joueur.'}</p>}
            <Link to="/app/rapports" className="mt-3 inline-block text-[13px] text-wy-bleu hover:underline">Tous les rapports ›</Link>
          </Panneau>
        ) : null}

        {onglet === 'scouting' ? (
          <Panneau titre="Actions de scouting">
            <div className="flex flex-wrap gap-2">
              <Link to={`/app/comparaison?ids=${id}`}><BoutonAzur>Comparer avec d'autres joueurs</BoutonAzur></Link>
              <BoutonAzur onClick={() => exporterPdf({ type: 'joueur', id: Number(id) }).catch(() => {})}>Exporter la fiche en PDF</BoutonAzur>
              <Link to={`/app/joueurs/${id}`}><BoutonAzur>Fiche dans l'application classique</BoutonAzur></Link>
            </div>
          </Panneau>
        ) : null}
      </div>
    </div>
  );
}
