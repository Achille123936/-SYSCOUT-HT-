import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { dateFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Alerte, Chargement } from '../components/ui';
import { BoutonAzur, Disque, Info, Lecture, Onglets, Panneau } from './ScoutUI';

const FORME: Record<string, string> = { V: '#6AB04C', N: '#9AA3AA', D: '#E04B3E' };

// Interface 3 — fiche d'une équipe : informations, bilan, matchs avec vidéo, compétitions, effectif, rapports, tactique.
export default function ScoutEquipe() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const onglet = params.get('onglet') || 'overview';
  const equipe = useChargement<any>(() => api.get(`/equipes/${id}/`), [id]);
  const club = useChargement<any>(() => api.get(`/clubs/${id}/`), [id]);
  const classements = useChargement<any[]>(async () => {
    const comps = (await api.tout('/competitions/')).filter((c: any) => c.clubs.includes(Number(id)));
    return Promise.all(comps.map(async (c: any) => {
      const r = await api.get(`/competitions/${c.id}/classement/`);
      return { competition: c, ligne: r.classement.find((x: any) => String(x.club) === id), total: r.classement.length };
    }));
  }, [id]);
  const rapports = useChargement<any[]>(() => (onglet === 'rapports' ? api.tout('/rapports/') : null), [onglet]);
  const matchs = useChargement<any[]>(() => api.tout('/matchs/', { club: id }), [id]);

  if (equipe.erreur && !equipe.donnees) return <div className="mx-auto max-w-[1400px] p-4"><Alerte ton="rouge">{equipe.erreur}</Alerte></div>;
  if (!equipe.donnees) return <div className="p-6"><Chargement /></div>;
  const e = equipe.donnees, c = club.donnees, b = e.bilan;
  const base = `/scout/equipe/${id}`;
  const onglets = [
    { id: 'overview', libelle: 'Overview', vers: base }, { id: 'matchs', libelle: 'Full matches', vers: `/scout/matchs?club=${id}` },
    { id: 'effectif', libelle: 'Squad', vers: `${base}?onglet=effectif` }, { id: 'evenements', libelle: 'Events', vers: `${base}?onglet=evenements` },
    { id: 'stats', libelle: 'Stats', vers: `${base}?onglet=stats` }, { id: 'rapports', libelle: 'Reports', vers: `${base}?onglet=rapports` },
    { id: 'tactique', libelle: 'Team assessments', vers: `${base}?onglet=tactique` },
  ];
  const avecVideo = (matchs.donnees || []).filter((m) => m.video_lecture);
  const parts = [{ nom: 'Victoires', valeur: b.victoires, couleur: '#6AB04C' }, { nom: 'Nuls', valeur: b.nuls, couleur: '#9AA3AA' }, { nom: 'Défaites', valeur: b.defaites, couleur: '#E04B3E' }];
  const rapportsClub = (rapports.donnees || []).filter((r) => r.joueur_club === e.club.nom);
  const sigle = e.club.sigle || e.club.nom.slice(0, 3);

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex items-center gap-3 border-b border-wy-bord bg-white px-4 py-2">
        <button onClick={() => navigate(-1)} className="px-1 text-lg text-wy-doux hover:text-wy-bleu" aria-label="Retour">‹</button>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-wy-fond text-[11px] font-extrabold text-wy-bleu" aria-hidden="true">{sigle.toUpperCase()}</span>
        <h1 className="text-[16px] font-bold uppercase">{e.club.nom}</h1>
        <span className="text-[13px]">{c?.division_libelle || e.club.division}</span><span className="text-[13px] text-wy-doux">{e.saison}</span>
      </div>
      <Onglets onglets={onglets} actif={onglet} />

      <div className="space-y-4 p-4">
        {onglet === 'overview' ? (
          <>
            {e.matchs_non_codes ? <Alerte ton="bleu">{e.matchs_non_codes} match(s) joué(s) ne sont pas encore codés : le bilan est incomplet.</Alerte> : null}
            <div className="grid gap-4 lg:grid-cols-12">
              <Panneau titre="Informations générales" className="lg:col-span-5">
                <dl>
                  <Info libelle="Nom">{e.club.nom}</Info><Info libelle="Sigle">{e.club.sigle || '—'}</Info><Info libelle="Ville">{e.club.ville}</Info>
                  <Info libelle="Stade">{e.club.stade || '—'}</Info><Info libelle="Division">{c?.division_libelle || e.club.division}</Info>
                  <Info libelle="Département">{c?.departement || '—'}</Info><Info libelle="Fondé en">{c?.date_fondation ? dateFR(c.date_fondation) : '—'}</Info>
                  <div className="mt-3" />
                  <Info libelle="Forme" orange><span className="inline-flex gap-1.5">{e.forme.length ? e.forme.map((f: string, i: number) => <span key={i} title={f} className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: FORME[f] || '#ccc' }}>{f}</span>) : '—'}</span></Info>
                  <Info libelle="Meilleur buteur" orange>{e.meilleur_buteur ? <Link className="text-wy-bleu hover:underline" to={`/scout/joueur/${e.meilleur_buteur.joueur}`}>{e.meilleur_buteur.nom} ({e.meilleur_buteur.buts})</Link> : '—'}</Info>
                  <Info libelle="Meilleur indice" orange>{e.meilleur_indice ? <Link className="text-wy-bleu hover:underline" to={`/scout/joueur/${e.meilleur_indice.joueur}`}>{e.meilleur_indice.nom} ({Math.round(e.meilleur_indice.indice_performance)})</Link> : '—'}</Info>
                </dl>
              </Panneau>
              <Panneau titre="Statistiques de l'équipe" className="lg:col-span-7">
                <div className="grid items-center gap-4 md:grid-cols-12">
                  <dl className="md:col-span-5">
                    <Info libelle="Points">{b.points}</Info><Info libelle="Matchs">{b.joues}</Info><Info libelle="Buts pour">{b.buts_pour}</Info><Info libelle="Buts contre">{b.buts_contre}</Info>
                    <Info libelle="Différence">{b.difference > 0 ? `+${b.difference}` : b.difference}</Info><Info libelle="Possession">{b.possession_moyenne != null ? `${b.possession_moyenne}%` : '—'}</Info>
                  </dl>
                  <div className="md:col-span-7"><Disque parts={parts} /></div>
                </div>
              </Panneau>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
              <Panneau titre="Vidéos" className="lg:col-span-5" droite={<Link to={`/scout/matchs?club=${id}`}><BoutonAzur>Tous les matchs</BoutonAzur></Link>}>
                <ul className="space-y-3 text-[13px]">
                  {avecVideo.slice(0, 6).map((m) => (
                    <li key={m.id}><Link to={`/scout/matchs?match=${m.id}&club=${id}`} className="flex items-center gap-3 hover:text-wy-bleu"><Lecture />
                      <span><span className="block">{m.domicile_nom} {m.score_domicile} - {m.score_exterieur} {m.exterieur_nom}</span><span className="block text-[11px] text-wy-bleu">{dateFR(m.date_match)} - {m.competition_nom}</span></span></Link></li>))}
                  {!avecVideo.length ? <li className="text-wy-doux">{matchs.enCours ? 'Chargement…' : 'Aucun match avec vidéo.'}</li> : null}
                </ul>
              </Panneau>
              <div className="space-y-4 lg:col-span-7">
                <Panneau titre="Compétitions en cours">
                  <table className="w-full text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Compétition</th><th className="text-right">Rang</th><th className="text-right">J</th><th className="text-right">V</th><th className="text-right">N</th><th className="text-right">D</th><th className="text-right">Pts</th></tr></thead>
                    <tbody>{(classements.donnees || []).map((x) => (
                      <tr key={x.competition.id} className="border-b border-wy-bord"><td className="py-2 text-wy-bleu">{x.competition.nom} <span className="text-wy-doux">· {x.competition.saison_libelle}</span></td><td className="text-right">{x.ligne ? `${x.ligne.rang}/${x.total}` : '—'}</td>
                        <td className="text-right">{x.ligne?.joues ?? '—'}</td><td className="text-right">{x.ligne?.victoires ?? '—'}</td><td className="text-right">{x.ligne?.nuls ?? '—'}</td><td className="text-right">{x.ligne?.defaites ?? '—'}</td><td className="text-right font-bold">{x.ligne?.points ?? '—'}</td></tr>))}</tbody></table>
                </Panneau>
                <Panneau titre="Derniers matchs">
                  {e.resultats.length ? <table className="w-full text-[13px]"><tbody>{e.resultats.map((r: any) => (
                    <tr key={r.id} className="border-b border-wy-bord"><td className="py-2 text-wy-bleu">{dateFR(r.date_match)}</td>
                      <td><Link className="hover:text-wy-bleu" to={`/scout/matchs?match=${r.id}&club=${id}`}>{r.domicile ? `${e.club.nom} - ${r.adversaire}` : `${r.adversaire} - ${e.club.nom}`}</Link></td>
                      <td className="text-right font-bold">{r.score}</td><td className="pl-3"><span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: FORME[r.issue] || '#ccc' }}>{r.issue}</span></td></tr>))}</tbody></table>
                    : <p className="text-[13px] text-wy-doux">Aucun résultat validé.</p>}
                </Panneau>
              </div>
            </div>
          </>
        ) : null}

        {onglet === 'effectif' ? (
          <Panneau titre="Effectif">
            <table className="w-full text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Joueur</th><th className="text-left">Poste</th><th className="text-right">Âge</th><th className="text-right">Min.</th><th className="text-right">Matchs</th><th className="text-right">Buts</th><th className="text-right">Passes déc.</th><th className="text-right">Indice</th></tr></thead>
              <tbody>{e.effectif.map((j: any) => <tr key={j.joueur} className="border-b border-wy-bord"><td className="py-2"><Link className="text-wy-bleu hover:underline" to={`/scout/joueur/${j.joueur}`}>{j.nom}</Link></td><td>{j.poste}</td><td className="text-right">{j.age}</td><td className="text-right">{j.minutes_jouees}</td><td className="text-right">{j.matchs_joues}</td><td className="text-right">{j.buts}</td><td className="text-right">{j.passes_decisives}</td><td className="text-right font-bold">{j.indice_performance != null ? Math.round(j.indice_performance) : '—'}</td></tr>)}</tbody></table>
          </Panneau>
        ) : null}

        {onglet === 'evenements' ? (
          <Panneau titre="Calendrier et résultats">
            <table className="w-full text-[13px]"><thead className="text-[11px] text-wy-doux"><tr className="border-b border-wy-bord"><th className="py-1.5 text-left">Date</th><th className="text-left">Match</th><th className="text-left">Compétition</th><th className="text-right">Score</th><th /></tr></thead>
              <tbody>{(matchs.donnees || []).map((m) => <tr key={m.id} className="border-b border-wy-bord"><td className="py-2 text-wy-bleu">{dateFR(m.date_match)}</td><td>{m.domicile_nom} - {m.exterieur_nom}</td><td>{m.competition_nom} · J{m.journee}</td><td className="text-right font-bold">{m.score_domicile}-{m.score_exterieur}</td>
                <td className="pl-4 text-right">{m.video_lecture ? <Link className="text-wy-bleu hover:underline" to={`/scout/matchs?match=${m.id}&club=${id}`}>Vidéo ›</Link> : <span className="text-wy-doux">{m.etat_libelle}</span>}</td></tr>)}</tbody></table>
          </Panneau>
        ) : null}

        {onglet === 'stats' ? (
          <Panneau titre="Bilan de la saison">
            <dl className="max-w-md text-[13px]">{[['Matchs joués', b.joues], ['Victoires', b.victoires], ['Nuls', b.nuls], ['Défaites', b.defaites], ['Buts marqués', b.buts_pour], ['Buts encaissés', b.buts_contre], ['Différence de buts', b.difference], ['Points', b.points], ['Possession moyenne', b.possession_moyenne != null ? `${b.possession_moyenne}%` : '—']].map(([l, v]) => (
              <div key={String(l)} className="flex justify-between border-b border-wy-bord py-1.5"><dt className="text-wy-doux">{l}</dt><dd className="font-semibold">{v}</dd></div>))}</dl>
          </Panneau>
        ) : null}

        {onglet === 'rapports' ? (
          <Panneau titre="Rapports sur les joueurs de l'équipe">
            {rapportsClub.length ? <ul className="divide-y divide-wy-bord text-[13px]">{rapportsClub.map((r) => (
              <li key={r.id} className="py-3"><Link className="font-semibold text-wy-bleu hover:underline" to={`/scout/joueur/${r.joueur}`}>{r.joueur_nom}</Link> <span className="text-wy-doux">· {r.note}/10 · {r.recommandation_libelle} · {r.etat_libelle}</span></li>))}</ul>
              : <p className="text-[13px] text-wy-doux">{rapports.enCours ? 'Chargement…' : 'Aucun rapport visible sur ces joueurs.'}</p>}
          </Panneau>
        ) : null}

        {onglet === 'tactique' ? (
          <Panneau titre="Analyse tactique par match">
            <ul className="divide-y divide-wy-bord text-[13px]">{(matchs.donnees || []).filter((m) => m.nb_evenements).map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5"><span>{m.domicile_nom} {m.score_domicile}-{m.score_exterieur} {m.exterieur_nom} <span className="text-wy-doux">· {dateFR(m.date_match)}</span></span>
                <Link to={`/app/matchs/${m.id}/tactique`}><BoutonAzur>Analyse tactique</BoutonAzur></Link></li>))}</ul>
          </Panneau>
        ) : null}
      </div>
    </div>
  );
}
