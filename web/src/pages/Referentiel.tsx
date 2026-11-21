import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Modal from '../components/Modal';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Titre, Vide } from '../components/ui';

const DIVISIONS: [string, string][] = [['D1', 'D1'], ['D2', 'D2'], ['ACADEMIE', 'Académie']];

// CU03 : clubs
export function Clubs() {
  const { a } = useAuth();
  const [q, setQ] = useState('');
  const [edition, setEdition] = useState<any | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const t = useChargement<any[]>(() => api.tout('/clubs/', { q }), [q]);
  const admin = a('ADMIN');
  const sauver = async () => {
    setErreur(null);
    try { if (edition.id) await api.patch(`/clubs/${edition.id}/`, edition); else await api.post('/clubs/', edition); setEdition(null); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const supprimer = async (c: any) => { if (!window.confirm(`Supprimer ${c.nom} ?`)) return; try { await api.delete(`/clubs/${c.id}/`); t.recharger(); } catch (e) { setErreur((e as Error).message); } };
  const maj = (k: string, v: string) => setEdition({ ...edition, [k]: v });

  return (
    <>
      <Titre titre="Clubs" sous="Clubs de D1, D2 et académies." droite={admin ? <Bouton onClick={() => { setEdition({ nom: '', sigle: '', ville: '', departement: '', stade: '', division: 'D1' }); setErreur(null); }}>+ Nouveau club</Bouton> : undefined} />
      <Card className="mb-6"><div className="max-w-sm"><Champ libelle="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} /></div></Card>
      <Alerte ton="rouge">{erreur}</Alerte>
      <Etat {...t}>
        <Card className="overflow-x-auto p-0">
          {t.donnees?.length ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Club</th><th className="px-4 py-3">Ville</th><th className="px-4 py-3">Stade</th><th className="px-4 py-3">Division</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {t.donnees.map((c) => (
                  <tr key={c.id}><td className="px-4 py-3 font-medium text-navy">{c.nom} <span className="text-slate-400">{c.sigle}</span></td><td className="px-4 py-3">{c.ville}</td><td className="px-4 py-3">{c.stade || '—'}</td><td className="px-4 py-3"><Badge ton="bleu">{c.division_libelle}</Badge></td>
                    <td className="px-4 py-3 text-right">{admin ? <span className="flex justify-end gap-2"><Bouton genre="secondaire" onClick={() => { setEdition({ ...c }); setErreur(null); }}>Modifier</Bouton><Bouton genre="secondaire" onClick={() => supprimer(c)}>Supprimer</Bouton></span> : null}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <Vide>Aucun club.</Vide>}
        </Card>
      </Etat>
      <Modal titre={edition?.id ? 'Modifier le club' : 'Nouveau club'} ouvert={!!edition} onFermer={() => setEdition(null)}>
        {edition ? (
          <div className="space-y-3"><Alerte ton="rouge">{erreur}</Alerte>
            <Champ libelle="Nom" value={edition.nom} onChange={(e) => maj('nom', e.target.value)} />
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Sigle" value={edition.sigle || ''} onChange={(e) => maj('sigle', e.target.value)} maxLength={6} /><Choix libelle="Division" value={edition.division} onChange={(e) => maj('division', e.target.value)}>{DIVISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix></div>
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Ville" value={edition.ville || ''} onChange={(e) => maj('ville', e.target.value)} /><Champ libelle="Département" value={edition.departement || ''} onChange={(e) => maj('departement', e.target.value)} /></div>
            <Champ libelle="Stade" value={edition.stade || ''} onChange={(e) => maj('stade', e.target.value)} />
            <Bouton onClick={sauver}>Enregistrer</Bouton></div>
        ) : null}
      </Modal>
    </>
  );
}

// CU04 : compétitions et saisons
export function Competitions() {
  const { a } = useAuth();
  const [edition, setEdition] = useState<any | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const t = useChargement<any[]>(() => api.tout('/competitions/'), []);
  const saisons = useChargement<any[]>(() => api.tout('/saisons/'), []);
  const clubs = useChargement<any[]>(() => api.tout('/clubs/'), []);
  const admin = a('ADMIN');
  const sauver = async () => {
    setErreur(null);
    try { if (edition.id) await api.patch(`/competitions/${edition.id}/`, edition); else await api.post('/competitions/', edition); setEdition(null); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const maj = (k: string, v: unknown) => setEdition({ ...edition, [k]: v });
  const bascule = (id: number) => maj('clubs', edition.clubs.includes(id) ? edition.clubs.filter((x: number) => x !== id) : [...edition.clubs, id]);

  return (
    <>
      <Titre titre="Compétitions" sous="Compétitions, saisons et équipes engagées."
        droite={admin ? <Bouton onClick={() => { setEdition({ nom: '', type: 'CHAMPIONNAT', niveau: 'D1', saison: saisons.donnees?.find((s) => s.est_courante)?.id ?? '', date_debut: '', date_fin: '', clubs: [] }); setErreur(null); }}>+ Nouvelle compétition</Bouton> : undefined} />
      <Card titre="Saisons" className="mb-6"><div className="flex flex-wrap gap-2">{(saisons.donnees || []).map((s) => <Badge key={s.id} ton={s.est_courante ? 'vert' : 'gris'}>{s.libelle}{s.est_courante ? ' · courante' : ''}</Badge>)}</div></Card>
      <Etat {...t}>
        <div className="grid gap-4 lg:grid-cols-2">
          {(t.donnees || []).map((c) => (
            <Card key={c.id} titre={c.nom} droite={<Badge ton="bleu">{c.type_libelle}</Badge>}>
              <p className="text-sm text-slate-500">{c.niveau} · saison {c.saison_libelle} · {dateFR(c.date_debut)} → {dateFR(c.date_fin)}</p>
              <p className="mt-2 text-sm">{c.clubs_detail?.map((k: any) => k.nom).join(', ') || 'Aucune équipe engagée'}</p>
              {admin ? <Bouton genre="secondaire" className="mt-3" onClick={() => { setEdition({ ...c, clubs: [...c.clubs] }); setErreur(null); }}>Modifier</Bouton> : null}
            </Card>
          ))}
        </div>
      </Etat>
      <Modal titre={edition?.id ? 'Modifier la compétition' : 'Nouvelle compétition'} ouvert={!!edition} onFermer={() => setEdition(null)} large>
        {edition ? (
          <div className="space-y-3"><Alerte ton="rouge">{erreur}</Alerte>
            <Champ libelle="Nom" value={edition.nom} onChange={(e) => maj('nom', e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              <Choix libelle="Type" value={edition.type} onChange={(e) => maj('type', e.target.value)}><option value="CHAMPIONNAT">Championnat</option><option value="COUPE">Coupe</option></Choix>
              <Choix libelle="Niveau" value={edition.niveau} onChange={(e) => maj('niveau', e.target.value)}>{DIVISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
              <Choix libelle="Saison" value={edition.saison} onChange={(e) => maj('saison', Number(e.target.value))}>{(saisons.donnees || []).map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}</Choix>
            </div>
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Début" type="date" value={edition.date_debut || ''} onChange={(e) => maj('date_debut', e.target.value)} /><Champ libelle="Fin" type="date" value={edition.date_fin || ''} onChange={(e) => maj('date_fin', e.target.value)} /></div>
            <fieldset><legend className="mb-1 text-sm font-medium text-slate-700">Équipes engagées</legend>
              <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-sm">{(clubs.donnees || []).map((k) => <label key={k.id} className="flex items-center gap-2"><input type="checkbox" checked={edition.clubs.includes(k.id)} onChange={() => bascule(k.id)} />{k.nom}</label>)}</div></fieldset>
            <Bouton onClick={sauver}>Enregistrer</Bouton></div>
        ) : null}
      </Modal>
    </>
  );
}
