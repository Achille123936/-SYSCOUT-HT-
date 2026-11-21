import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, exporterPdf, type Page } from '../lib/api';
import { LIGNES_STATS, nombre } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Radar from '../components/Radar';
import { Alerte, Bouton, Card, Champ, Etat, Titre } from '../components/ui';

const COULEURS = ['#2475D2', '#E5484D', '#20B56B', '#F59E0B', '#7c3aed'];

// SRS §12.2 : de deux à cinq joueurs sur la même saison, avec leurs minutes jouées en contexte.
export default function Comparaison() {
  const [params, setParams] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const t = useChargement<any>(() => (ids.length >= 2 ? api.get('/joueurs/comparer/', { ids: ids.join(',') }) : null), [ids.join(',')]);
  const noms = useChargement<any[]>(() => (ids.length ? Promise.all(ids.map((i) => api.get(`/joueurs/${i}/`))) : Promise.resolve([])), [ids.join(',')]);

  useEffect(() => {
    if (q.trim().length < 2) { setSuggestions([]); return; }
    const minuteur = setTimeout(() => {
      api.get<Page<any>>('/joueurs/', { q, page_size: 8 }).then((r) => setSuggestions(r.results.filter((j) => !ids.includes(String(j.id))))).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(minuteur);
  }, [q, ids.join(',')]);

  const definir = (liste: string[]) => setParams(liste.length ? { ids: liste.join(',') } : {});
  const fiches: any[] = t.donnees?.joueurs || [];
  const exporter = async () => {
    try { await exporterPdf({ type: 'comparaison', id: Number(ids[0]), autre: ids.slice(1).map(Number) }); } catch (e) { setMessage((e as Error).message); }
  };

  return (
    <>
      <Titre titre="Comparaison" sous={t.donnees ? `Saison ${t.donnees.saison.libelle} · centiles parmi les joueurs du même poste (minimum 450 minutes)` : 'Choisissez de deux à cinq joueurs.'}
        droite={fiches.length >= 2 ? <Bouton onClick={exporter}>Exporter en PDF</Bouton> : undefined} />
      <Card titre={`Joueurs comparés (${ids.length}/5)`} className="mb-6">
        <div className="flex flex-wrap gap-2">
          {(noms.donnees || []).map((j, i) => (
            <span key={j.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm" style={{ borderColor: COULEURS[i], color: COULEURS[i] }}>
              <Link to={`/app/joueurs/${j.id}`} className="font-semibold">{j.nom_complet}</Link>
              <button aria-label={`Retirer ${j.nom_complet}`} onClick={() => definir(ids.filter((x) => x !== String(j.id)))}>✕</button>
            </span>
          ))}
        </div>
        {ids.length < 5 ? (
          <div className="relative mt-4 max-w-md">
            <Champ libelle="Ajouter un joueur" placeholder="Nom du joueur…" value={q} onChange={(e) => setQ(e.target.value)} />
            {suggestions.length ? (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {suggestions.map((j) => (
                  <li key={j.id}><button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { definir([...ids, String(j.id)]); setQ(''); }}>
                    <span>{j.nom_complet}</span><span className="text-slate-400">{j.poste_libelle} · {j.club_nom}</span></button></li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>
      {ids.length < 2 ? <Alerte ton="bleu">Ajoutez au moins deux joueurs pour lancer la comparaison.</Alerte> : null}
      <Alerte ton="rouge">{message}</Alerte>
      {ids.length >= 2 ? (
        <Etat {...t}>
          {t.donnees ? (
            <div className="space-y-6">
              {t.donnees.avertissements.map((a: string) => <Alerte key={a}>{a}</Alerte>)}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card titre="Radar des centiles"><Radar series={fiches.map((f, i) => ({ nom: f.joueur.nom_complet, couleur: COULEURS[i], centiles: f.statistique?.centiles }))} /></Card>
                <Card titre="Statistiques de la saison" className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs uppercase"><th className="py-2 text-slate-500">Indicateur</th>
                      {fiches.map((f, i) => <th key={f.joueur.id} className="py-2" style={{ color: COULEURS[i] }}>{f.joueur.nom}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr><td className="py-2 text-slate-500">Indice /100</td>{fiches.map((f) => <td key={f.joueur.id} className="py-2 font-bold">{f.statistique?.indice_performance != null ? Math.round(f.statistique.indice_performance) : '—'}</td>)}</tr>
                      {LIGNES_STATS.map(([cle, nom, unite]) => (
                        <tr key={cle}><td className="py-2 text-slate-500">{nom}</td>{fiches.map((f) => <td key={f.joueur.id} className="py-2 font-semibold">{f.statistique ? nombre(f.statistique[cle], unite) : '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </div>
          ) : null}
        </Etat>
      ) : null}
    </>
  );
}
