import { useState } from 'react';
import { api } from '../lib/api';
import { useChargement } from '../lib/hooks';
import { Card, Choix, Etat, Titre, Vide } from '../components/ui';

const COULEUR_FORME: Record<string, string> = { V: 'bg-brand-green', N: 'bg-slate-400', D: 'bg-brand-red' };

// Classement des équipes d'une compétition (matchs validés seulement)
export default function Championnat() {
  const [comp, setComp] = useState('');
  const liste = useChargement<any[]>(() => api.tout('/competitions/'), []);
  const choisie = comp || (liste.donnees?.[0]?.id ? String(liste.donnees[0].id) : '');
  const t = useChargement<any>(() => (choisie ? api.get(`/competitions/${choisie}/classement/`) : null), [choisie]);

  return (
    <>
      <Titre titre="Championnat" sous="Classement des équipes par compétition." />
      <Card className="mb-6"><div className="max-w-sm">
        <Choix libelle="Compétition" value={choisie} onChange={(e) => setComp(e.target.value)}>{(liste.donnees || []).map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.saison_libelle}</option>)}</Choix></div></Card>
      <Etat {...t}>
        {t.donnees ? (
          <Card className="overflow-x-auto p-0">
            {t.donnees.classement.length ? (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Équipe</th><th className="px-2 py-3 text-right">J</th><th className="px-2 py-3 text-right">V</th><th className="px-2 py-3 text-right">N</th><th className="px-2 py-3 text-right">D</th><th className="px-2 py-3 text-right">BP</th><th className="px-2 py-3 text-right">BC</th><th className="px-2 py-3 text-right">Diff.</th><th className="px-2 py-3">Forme</th><th className="px-4 py-3 text-right">Pts</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {t.donnees.classement.map((c: any) => (
                    <tr key={c.club}><td className="px-4 py-3 text-slate-400">{c.rang}</td><td className="px-4 py-3 font-medium text-navy">{c.nom}</td>
                      <td className="px-2 py-3 text-right">{c.joues}</td><td className="px-2 py-3 text-right">{c.victoires}</td><td className="px-2 py-3 text-right">{c.nuls}</td><td className="px-2 py-3 text-right">{c.defaites}</td>
                      <td className="px-2 py-3 text-right">{c.buts_pour}</td><td className="px-2 py-3 text-right">{c.buts_contre}</td><td className="px-2 py-3 text-right">{c.difference > 0 ? `+${c.difference}` : c.difference}</td>
                      <td className="px-2 py-3"><span className="flex gap-1">{c.forme.map((f: string, i: number) => <span key={i} title={f} className={`h-2.5 w-2.5 rounded-full ${COULEUR_FORME[f] || 'bg-slate-300'}`} />)}</span></td>
                      <td className="px-4 py-3 text-right text-base font-extrabold text-navy">{c.points}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <Vide>Aucun match validé dans cette compétition.</Vide>}
          </Card>
        ) : null}
      </Etat>
    </>
  );
}
