import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useChargement } from '../lib/hooks';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Titre, Vide } from '../components/ui';

// Tableau de bord de l'entraîneur : bilan, forme, effectif. Un entraîneur voit son club ; les autres choisissent un club.
export function Equipe() {
  const { utilisateur } = useAuth();
  const liste = useChargement<any>(() => api.get('/equipes/'), []);
  const [choix, setChoix] = useState('');
  const club = choix || (liste.donnees?.mon_club ? String(liste.donnees.mon_club) : '') || (liste.donnees?.clubs?.[0] ? String(liste.donnees.clubs[0].id) : '');
  const t = useChargement<any>(() => (club ? api.get(`/equipes/${club}/`) : null), [club]);
  const d = t.donnees;
  const libre = !liste.donnees?.mon_club;

  return (
    <>
      <Titre titre="Mon équipe" sous={d ? `${d.club.nom} · saison ${d.saison}` : utilisateur?.club_nom} />
      {libre && liste.donnees ? <Card className="mb-6"><div className="max-w-sm"><Choix libelle="Club" value={club} onChange={(e) => setChoix(e.target.value)}>{liste.donnees.clubs.map((c: any) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix></div></Card> : null}
      <Etat {...t}>
        {d ? (
          <div className="space-y-6">
            {d.matchs_non_codes ? <Alerte ton="bleu">{d.matchs_non_codes} match(s) joué(s) ne sont pas encore codés : le bilan est incomplet.</Alerte> : null}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[['Points', d.bilan.points], ['Matchs', d.bilan.joues], ['V / N / D', `${d.bilan.victoires} / ${d.bilan.nuls} / ${d.bilan.defaites}`], ['Buts', `${d.bilan.buts_pour} – ${d.bilan.buts_contre}`], ['Possession', d.bilan.possession_moyenne != null ? `${d.bilan.possession_moyenne} %` : '—']].map(([l, v]) => (
                <div key={String(l)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-2xl font-extrabold text-navy">{v}</p><p className="text-sm text-slate-500">{l}</p></div>))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card titre="Derniers résultats">
                {d.resultats.length ? <ul className="divide-y divide-slate-100 text-sm">{d.resultats.map((r: any) => <li key={r.id} className="py-2"><Link className="flex items-center gap-3 hover:text-brand-blue" to={`/app/matchs/${r.id}`}><span className="flex-1 truncate text-right">{r.domicile}</span><span className="font-bold text-navy">{r.score}</span><span className="flex-1 truncate">{r.exterieur}</span></Link></li>)}</ul> : <Vide>Aucun résultat.</Vide>}
              </Card>
              <Card titre="Points forts">
                <p className="text-sm">{d.meilleur_buteur ? <>Meilleur buteur : <b>{d.meilleur_buteur.nom}</b> ({d.meilleur_buteur.buts} buts)</> : 'Pas encore de buteur.'}</p>
                <p className="mt-2 text-sm">{d.meilleur_indice ? <>Meilleur indice : <b>{d.meilleur_indice.nom}</b> ({Math.round(d.meilleur_indice.indice_performance)})</> : 'Pas encore d\'indice.'}</p>
              </Card>
            </div>
            <Card titre="Effectif" className="overflow-x-auto">
              <table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Joueur</th><th>Poste</th><th>Âge</th><th className="text-right">Min.</th><th className="text-right">Buts</th><th className="text-right">Passes déc.</th><th className="text-right">Indice</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{d.effectif.map((j: any) => <tr key={j.joueur}><td className="py-2 font-medium text-navy"><Link className="hover:text-brand-blue" to={`/app/joueurs/${j.joueur}`}>{j.nom}</Link></td><td>{j.poste}</td><td>{j.age}</td><td className="text-right">{j.minutes_jouees}</td><td className="text-right">{j.buts}</td><td className="text-right">{j.passes_decisives}</td><td className="text-right">{j.indice_performance != null ? <Badge ton="vert">{Math.round(j.indice_performance)}</Badge> : '—'}</td></tr>)}</tbody></table>
            </Card>
          </div>
        ) : null}
      </Etat>
    </>
  );
}

interface Echange { question: string; reponse: string; liens?: { ecran: string; params: { id: number }; titre: string }[] }
const LIENS: Record<string, (id: number) => string> = { JoueurDetail: (id) => `/app/joueurs/${id}`, MatchDetail: (id) => `/app/matchs/${id}` };

// Assistant : répond à une question sur un joueur, une équipe, un match, à partir des données validées
export function Assistant() {
  const [question, setQuestion] = useState('');
  const [fil, setFil] = useState<Echange[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const poser = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim(); if (!q) return;
    setErreur(null); setEnCours(true);
    try { const r = await api.post('/assistant/', { question: q }); setFil((f) => [...f, { question: q, reponse: r.reponse, liens: r.liens }]); setQuestion(''); }
    catch (x) { setErreur((x as Error).message); } finally { setEnCours(false); }
  };
  return (
    <>
      <Titre titre="Assistant" sous="Posez une question sur un joueur, une équipe ou un match (ex. « Qui est le meilleur buteur ? »)." />
      <div className="space-y-4">
        {fil.map((x, i) => (
          <div key={i} className="space-y-2">
            <p className="ml-auto max-w-lg rounded-2xl bg-brand-blue px-4 py-2 text-sm text-white">{x.question}</p>
            <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"><p className="whitespace-pre-line">{x.reponse}</p>
              {x.liens?.length ? <p className="mt-2 flex flex-wrap gap-2">{x.liens.map((l) => LIENS[l.ecran] ? <Link key={`${l.ecran}${l.params.id}`} to={LIENS[l.ecran](l.params.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-brand-blue hover:bg-blue-50">{l.titre}</Link> : null)}</p> : null}</div>
          </div>
        ))}
        <Alerte ton="rouge">{erreur}</Alerte>
        <form onSubmit={poser} className="flex max-w-2xl items-end gap-3"><div className="flex-1"><Champ libelle="Votre question" value={question} onChange={(e) => setQuestion(e.target.value)} /></div><Bouton type="submit" disabled={enCours}>{enCours ? '…' : 'Demander'}</Bouton></form>
      </div>
    </>
  );
}
