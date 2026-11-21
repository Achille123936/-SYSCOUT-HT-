import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { GROUPES } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Alerte, Badge, Card, Champ, Choix, Etat, Titre, Vide } from '../components/ui';

// Apprentissage automatique : profils de jeu (k-moyennes), modèle xG (régression logistique), joueurs similaires.
export default function Apprentissage() {
  const [groupe, setGroupe] = useState('MILIEU');
  const [recherche, setRecherche] = useState('');
  const [joueur, setJoueur] = useState<any | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const profils = useChargement<any>(() => api.get('/ia/profils/', { groupe }), [groupe]);
  const xg = useChargement<any>(() => api.get('/ia/xg/'), []);
  const similaires = useChargement<any>(() => (joueur ? api.get('/ia/similaires/', { joueur: joueur.id }) : null), [joueur?.id]);

  const chercher = (v: string) => {
    setRecherche(v);
    if (v.trim().length < 2) return setSuggestions([]);
    api.get<any>('/joueurs/', { q: v, page_size: 6 }).then((r) => setSuggestions(r.results)).catch(() => setSuggestions([]));
  };

  return (
    <>
      <Titre titre="Apprentissage" sous="Profils de jeu, modèle xG et joueurs similaires, calculés sur les matchs validés." />
      <div className="space-y-6">
        <Card titre="Joueurs similaires">
          <div className="relative max-w-sm"><Champ libelle="Joueur" placeholder="Rechercher un joueur…" value={recherche} onChange={(e) => chercher(e.target.value)} />
            {suggestions.length ? <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">{suggestions.map((j) => <li key={j.id}><button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setJoueur(j); setRecherche(j.nom_complet); setSuggestions([]); }}><span>{j.nom_complet}</span><span className="text-slate-400">{j.poste_libelle}</span></button></li>)}</ul> : null}</div>
          {joueur ? (
            <Etat {...similaires}>
              {similaires.donnees ? (
                similaires.donnees.eligible ? (
                  <div className="mt-4"><p className="mb-2 text-sm text-slate-500">Profil : {similaires.donnees.profil} · comparé à {similaires.donnees.compares} joueurs du même poste.</p>
                    <ul className="divide-y divide-slate-100 text-sm">{similaires.donnees.similaires.map((s: any) => (
                      <li key={s.id} className="flex items-center gap-3 py-2"><Link className="flex-1 font-medium text-navy hover:text-brand-blue" to={`/app/joueurs/${s.joueur}`}>{s.joueur_nom}</Link><span className="text-slate-500">{s.poste} · {s.club_nom}</span><Badge ton="vert">{Math.round(s.similarite * 100)} % similaire</Badge>
                        <Link className="text-brand-blue hover:underline" to={`/app/comparaison?ids=${joueur.id},${s.joueur}`}>Comparer</Link></li>))}</ul></div>
                ) : <div className="mt-4"><Alerte>{similaires.donnees.detail}</Alerte></div>
              ) : null}
            </Etat>
          ) : null}
        </Card>

        <Card titre="Profils de jeu" droite={<div className="w-40"><Choix value={groupe} onChange={(e) => setGroupe(e.target.value)} aria-label="Poste">{GROUPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix></div>}>
          <Etat {...profils}>
            {profils.donnees?.profils?.length ? (
              <div className="grid gap-4 md:grid-cols-2">{profils.donnees.profils.map((p: any) => (
                <div key={p.nom} className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-navy">{p.nom}</h3>
                  <ul className="mt-2 space-y-1 text-sm">{p.joueurs.map((j: any) => <li key={j.joueur} className="flex justify-between"><Link className="hover:text-brand-blue" to={`/app/joueurs/${j.joueur}`}>{j.joueur_nom}</Link><span className="text-slate-400">{j.club_nom}</span></li>)}</ul></div>))}</div>
            ) : <Vide>Pas assez de joueurs classés pour ce poste.</Vide>}
          </Etat>
        </Card>

        <Card titre="Modèle xG (buts attendus)">
          <Etat {...xg}>
            {xg.donnees?.entraine ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Tirs d'entraînement</dt><dd className="font-semibold">{xg.donnees.nb_tirs} ({xg.donnees.nb_buts} buts)</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Perte du modèle / référence</dt><dd className="font-semibold">{xg.donnees.perte} / {xg.donnees.perte_reference}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Gain sur la référence</dt><dd className="font-semibold text-brand-green">{xg.donnees.gain_pct} %</dd></div>
                </dl>
                <ul className="divide-y divide-slate-100 text-sm">{xg.donnees.exemples.map((e: any) => <li key={e.tir} className="flex justify-between py-2"><span>{e.tir}</span><span className="font-bold text-navy">{e.xg}</span></li>)}</ul>
              </div>
            ) : <Vide>Le modèle n'est pas encore entraîné : il faut des tirs codés.</Vide>}
          </Etat>
        </Card>
      </div>
    </>
  );
}
