import { useState } from 'react';
import { api, type Page } from '../lib/api';
import { dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Modal from '../components/Modal';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Pagination, Titre, Vide } from '../components/ui';

const ROLES: [string, string][] = [['ADMIN', 'Administrateur'], ['ANALYSTE', 'Analyste vidéo'], ['SCOUT', 'Scout'], ['DIRECTEUR', 'Directeur sportif'], ['AGENT', 'Agent commercial'], ['CLIENT', 'Club client'], ['CLUB_ADMIN', 'Administrateur de club'], ['COACH', 'Entraîneur'], ['JOUEUR', 'Joueur']];

// CU02 : comptes, rôles et droits
export function Utilisateurs() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [edition, setEdition] = useState<any | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const t = useChargement<Page<any>>(() => api.get('/utilisateurs/', { q, role, page, page_size: 25 }), [q, role, page]);
  const clubs = useChargement<any[]>(() => api.tout('/clubs/'), []);

  const sauver = async () => {
    setErreur(null);
    try {
      if (edition.id) await api.patch(`/utilisateurs/${edition.id}/`, edition);
      else { const r = await api.post('/utilisateurs/', edition); setInfo(`Compte créé. Mot de passe provisoire : ${r.mot_de_passe_provisoire} (à transmettre à l'utilisateur, il devra le changer).`); }
      setEdition(null); t.recharger();
    } catch (e) { setErreur((e as Error).message); }
  };
  const act = async (u: any, chemin: string, texte?: string) => {
    setErreur(null); setInfo(null);
    try { const r = await api.post(`/utilisateurs/${u.id}/${chemin}/`); if (r?.mot_de_passe_provisoire) setInfo(`Mot de passe provisoire de ${u.nom_utilisateur} : ${r.mot_de_passe_provisoire}`); else if (texte) setInfo(texte); t.recharger(); } catch (e) { setErreur((e as Error).message); }
  };
  const basculer = async (u: any) => { try { if (u.is_active) await api.delete(`/utilisateurs/${u.id}/`); else await api.patch(`/utilisateurs/${u.id}/`, { is_active: true }); t.recharger(); } catch (e) { setErreur((e as Error).message); } };
  const maj = (k: string, v: unknown) => setEdition({ ...edition, [k]: v });

  return (
    <>
      <Titre titre="Utilisateurs" sous="Comptes, rôles et droits." droite={<Bouton onClick={() => { setEdition({ nom_utilisateur: '', prenom: '', nom: '', courriel: '', telephone: '', role: 'SCOUT', club: '' }); setErreur(null); }}>+ Nouveau compte</Bouton>} />
      <Card className="mb-6"><div className="grid max-w-xl grid-cols-2 gap-3"><Champ libelle="Rechercher" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Choix libelle="Rôle" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">Tous</option>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix></div></Card>
      <div className="mb-4 space-y-2"><Alerte ton="rouge">{erreur}</Alerte><Alerte ton="vert">{info}</Alerte></div>
      <Etat {...t}>
        {t.donnees ? (
          <>
            <Card className="overflow-x-auto p-0">
              {t.donnees.results.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Compte</th><th className="px-4 py-3">Rôle</th><th className="px-4 py-3">Club</th><th className="px-4 py-3">État</th><th /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {t.donnees.results.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3"><span className="font-medium text-navy">{u.nom_complet}</span> <span className="text-slate-400">@{u.nom_utilisateur}</span></td><td className="px-4 py-3">{u.role_libelle}</td><td className="px-4 py-3">{u.club_nom || '—'}</td>
                        <td className="px-4 py-3">{u.bloque ? <Badge ton="rouge">Bloqué</Badge> : u.demande_inscription && !u.is_active ? <Badge ton="orange">Demande d'inscription</Badge> : <Badge ton={u.is_active ? 'vert' : 'gris'}>{u.is_active ? 'Actif' : 'Désactivé'}</Badge>}</td>
                        <td className="px-4 py-3"><span className="flex flex-wrap justify-end gap-2">
                          <Bouton genre="secondaire" onClick={() => { setEdition({ ...u, club: u.club ?? '' }); setErreur(null); }}>Modifier</Bouton>
                          {u.bloque ? <Bouton genre="secondaire" onClick={() => act(u, 'debloquer', 'Compte débloqué.')}>Débloquer</Bouton> : null}
                          <Bouton genre="secondaire" onClick={() => window.confirm(`Réinitialiser le mot de passe de ${u.nom_utilisateur} ?`) && act(u, 'reinitialiser')}>Mot de passe</Bouton>
                          <Bouton genre="secondaire" onClick={() => basculer(u)}>{u.is_active ? 'Désactiver' : 'Activer'}</Bouton></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Vide>Aucun compte.</Vide>}
            </Card>
            <Pagination page={page} total={t.donnees.count} taille={25} onChange={setPage} />
          </>
        ) : null}
      </Etat>
      <Modal titre={edition?.id ? 'Modifier le compte' : 'Nouveau compte'} ouvert={!!edition} onFermer={() => setEdition(null)}>
        {edition ? (
          <div className="space-y-3"><Alerte ton="rouge">{erreur}</Alerte>
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Prénom" value={edition.prenom} onChange={(e) => maj('prenom', e.target.value)} /><Champ libelle="Nom" value={edition.nom} onChange={(e) => maj('nom', e.target.value)} /></div>
            <Champ libelle="Nom d'utilisateur" value={edition.nom_utilisateur} onChange={(e) => maj('nom_utilisateur', e.target.value)} disabled={!!edition.id} />
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Courriel" type="email" value={edition.courriel} onChange={(e) => maj('courriel', e.target.value)} /><Champ libelle="Téléphone" value={edition.telephone || ''} onChange={(e) => maj('telephone', e.target.value)} /></div>
            <Choix libelle="Rôle" value={edition.role} onChange={(e) => maj('role', e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
            {['CLIENT', 'CLUB_ADMIN', 'COACH', 'JOUEUR'].includes(edition.role) ? <Choix libelle="Club" value={edition.club} onChange={(e) => maj('club', e.target.value ? Number(e.target.value) : null)}><option value="">— aucun —</option>{(clubs.donnees || []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix> : null}
            <Bouton onClick={sauver}>Enregistrer</Bouton></div>
        ) : null}
      </Modal>
    </>
  );
}

// CU16 : journal d'audit et état des sauvegardes
export function Audit() {
  const [f, setF] = useState({ table: '', action: '', debut: '', fin: '' });
  const [page, setPage] = useState(1);
  const t = useChargement<Page<any>>(() => api.get('/audit/', { ...f, page, page_size: 30 }), [JSON.stringify(f), page]);
  const sauvegardes = useChargement<any[]>(() => api.get('/sauvegarde/'), []);
  const maj = (k: string, v: string) => { setF({ ...f, [k]: v }); setPage(1); };

  return (
    <>
      <Titre titre="Journal d'audit" sous="Opérations sensibles : qui, quoi, quand, depuis quelle adresse." />
      <Card titre="Sauvegardes" className="mb-6">
        <ul className="text-sm">{(sauvegardes.donnees || []).map((s) => <li key={s.destination} className="flex justify-between border-b border-slate-100 py-2 last:border-0"><span className="font-medium">{s.destination}</span><span className="text-slate-500">{s.nombre} copie(s){s.derniere ? ` · dernière : ${dateHeureFR(s.derniere)}` : ' · aucune'}</span></li>)}</ul>
      </Card>
      <Card className="mb-6"><div className="grid gap-3 sm:grid-cols-4"><Champ libelle="Table" placeholder="joueur, match…" value={f.table} onChange={(e) => maj('table', e.target.value)} /><Champ libelle="Action" placeholder="CONNEXION…" value={f.action} onChange={(e) => maj('action', e.target.value.toUpperCase())} /><Champ libelle="Du" type="date" value={f.debut} onChange={(e) => maj('debut', e.target.value)} /><Champ libelle="Au" type="date" value={f.fin} onChange={(e) => maj('fin', e.target.value)} /></div></Card>
      <Etat {...t}>
        {t.donnees ? (
          <>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Utilisateur</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Objet</th><th className="px-4 py-3">Détail</th><th className="px-4 py-3">IP</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {t.donnees.results.map((o) => (
                    <tr key={o.id}><td className="whitespace-nowrap px-4 py-2 text-slate-500">{dateHeureFR(o.date_heure)}</td><td className="px-4 py-2">{o.utilisateur_nom || '—'}</td><td className="px-4 py-2"><Badge>{o.action_libelle}</Badge></td><td className="px-4 py-2">{o.table_concernee} #{o.id_enregistrement}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-xs text-slate-500" title={JSON.stringify(o.valeur_apres)}>{o.valeur_apres ? JSON.stringify(o.valeur_apres) : ''}</td><td className="px-4 py-2 text-slate-400">{o.adresse_ip}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Pagination page={page} total={t.donnees.count} taille={30} onChange={setPage} />
          </>
        ) : null}
      </Etat>
    </>
  );
}
