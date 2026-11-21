import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useChargement } from '../lib/hooks';
import { Chaleur, H, L, Terrain } from '../components/Terrain';
import { Alerte, Badge, Card, Champ, Etat, Titre } from '../components/ui';

// MOD-08 : analyse tactique d'un match à partir des événements officiels (zones, positions, formation, bloc, pressing).
export default function Tactique() {
  const { id } = useParams();
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const m = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);
  const t = useChargement<any>(() => api.get(`/matchs/${id}/tactique/`, { debut, fin }), [id, debut, fin]);
  const d = t.donnees;
  const eq = [['domicile', m.donnees?.domicile_nom, '#2475D2'], ['exterieur', m.donnees?.exterieur_nom, '#E5484D']] as const;

  return (
    <>
      <Titre titre="Analyse tactique" sous={m.donnees ? <>{m.donnees.domicile_nom} – {m.donnees.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></> : undefined} />
      <Card className="mb-6"><div className="grid max-w-md grid-cols-2 gap-3">
        <Champ libelle="De la minute" type="number" min={0} value={debut} onChange={(e) => setDebut(e.target.value)} />
        <Champ libelle="À la minute" type="number" min={0} value={fin} onChange={(e) => setFin(e.target.value)} />
      </div></Card>
      <Etat {...t}>
        {d ? (
          <div className="space-y-6">
            <Alerte ton="bleu">Source : {d.source}. Les indicateurs ne valent que par la qualité du codage.</Alerte>
            <div className="grid gap-6 lg:grid-cols-2">
              {eq.map(([cle, nom, couleur]) => {
                const e = d.equipes[cle];
                const c = e.carte_activite;
                const grille = Array.from({ length: c.rangs }, (_, r) => c.cases.slice(r * c.colonnes, (r + 1) * c.colonnes));
                return (
                  <Card key={cle} titre={nom} droite={<Badge ton="bleu">{e.actions} actions</Badge>}>
                    <Terrain derriere={<Chaleur grille={grille} maximum={Math.max(1, ...c.cases)} couleur={couleur} />}>
                      {e.positions_moyennes.filter((p: any) => p.x != null).map((p: any) => (
                        <g key={p.joueur} opacity={p.fiable ? 1 : 0.4}>
                          <circle cx={(p.x / 100) * L} cy={(p.y / 100) * H} r={2.6} fill={couleur} stroke="#fff" strokeWidth={0.4} />
                          <text x={(p.x / 100) * L} y={(p.y / 100) * H + 0.9} fontSize="2.6" fill="#fff" textAnchor="middle" fontWeight="bold">{p.numero_maillot ?? ''}</text>
                        </g>
                      ))}
                    </Terrain>
                    <p className="mt-2 text-xs text-slate-500">Cases : zones d'activité. Ronds : position moyenne (pâle = peu d'actions, peu fiable).</p>
                    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <dt className="text-slate-500">Formation déclarée</dt><dd className="font-semibold">{e.formation.declaree || '—'}</dd>
                      <dt className="text-slate-500">Formation observée</dt><dd className="font-semibold">{e.formation.observee?.schema || '—'}</dd>
                      <dt className="text-slate-500">Largeur / longueur du bloc</dt><dd className="font-semibold">{e.bloc.largeur_m ?? '—'} m / {e.bloc.longueur_m ?? '—'} m</dd>
                      <dt className="text-slate-500">Hauteur de la ligne arrière</dt><dd className="font-semibold">{e.bloc.hauteur_defense_m ?? '—'} m</dd>
                      <dt className="text-slate-500">Pressing (PPDA)</dt><dd className="font-semibold">{e.pressing.ppda ?? '—'}</dd>
                      <dt className="text-slate-500">Passes progressives</dt><dd className="font-semibold">{e.passes_progressives.nombre}</dd>
                      <dt className="text-slate-500">Récupérations hautes</dt><dd className="font-semibold">{e.transitions.recuperations_hautes} / {e.transitions.recuperations}</dd>
                      <dt className="text-slate-500">Suivies d'un tir (15 s)</dt><dd className="font-semibold">{e.transitions.suivies_d_un_tir}</dd>
                    </dl>
                    <div className="mt-3 space-y-2">{e.avertissements.map((a: string) => <Alerte key={a}>{a}</Alerte>)}</div>
                  </Card>
                );
              })}
            </div>
            <Card titre="Définitions des indicateurs">
              <dl className="space-y-2 text-sm">{Object.entries(d.definitions).map(([k, v]) => <div key={k}><dt className="font-semibold capitalize text-navy">{k.replace(/_/g, ' ')}</dt><dd className="text-slate-600">{String(v)}</dd></div>)}</dl>
            </Card>
          </div>
        ) : null}
      </Etat>
    </>
  );
}
