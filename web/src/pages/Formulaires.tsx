import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useChargement } from '../lib/hooks';
import { Alerte, Bouton, Card, Champ, Choix, Chargement, Titre } from '../components/ui';

const POSTES: [string, string][] = [['G', 'Gardien'], ['DC', 'Défenseur central'], ['DL', 'Défenseur latéral'], ['MD', 'Milieu défensif'], ['MC', 'Milieu central'], ['MO', 'Milieu offensif'], ['AIL', 'Ailier'], ['BU', 'Attaquant (buteur)']];
const VIDE_JOUEUR = { nom: '', prenom: '', sexe: 'M', date_naissance: '', nationalite: 'Haïtienne', telephone: '', courriel: '', adresse: '', poste: 'MC', pied_fort: 'D', taille: '', poids: '', club_actuel: '', type_contrat: 'AMATEUR', nom_tuteur: '', lien_tuteur: '' };

// CU05 : créer ou modifier un joueur (un mineur exige un tuteur et son accord écrit)
export function JoueurForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState<any>(VIDE_JOUEUR);
  const [accord, setAccord] = useState<File | null>(null);
  const [erreur, setErreur] = useState<Record<string, string> & { _: string | null }>({ _: null } as any);
  const clubs = useChargement<any[]>(() => api.tout('/clubs/'), []);
  const existant = useChargement<any>(() => (id ? api.get(`/joueurs/${id}/`) : null), [id]);
  useEffect(() => { if (existant.donnees) setF({ ...VIDE_JOUEUR, ...Object.fromEntries(Object.entries(existant.donnees).map(([k, v]) => [k, v ?? ''])) }); }, [existant.donnees]);
  const maj = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const err = (k: string) => (erreur as any)[k];
  const mineur = f.date_naissance && (Date.now() - new Date(f.date_naissance).getTime()) / 31557600000 < 18;

  const enregistrer = async () => {
    setErreur({ _: null } as any);
    const corps: any = { ...f, club_actuel: Number(f.club_actuel), taille: f.taille === '' ? null : Number(f.taille), poids: f.poids === '' ? null : Number(f.poids) };
    ['photo', 'accord_tuteur', 'age', 'est_mineur', 'nom_complet', 'poste_libelle', 'groupe_poste', 'club_nom', 'club_division', 'indice_performance'].forEach((k) => delete corps[k]);
    if (id) delete corps.type_contrat;
    let envoi: any = corps;
    if (accord) { // l'accord écrit du tuteur est un fichier : l'envoi passe en multipart
      envoi = new FormData();
      Object.entries(corps).forEach(([k, v]) => { if (v !== null && v !== undefined) envoi.append(k, String(v)); });
      envoi.append('accord_tuteur', accord);
    }
    try {
      const r = id ? await api.patch(`/joueurs/${id}/`, envoi) : await api.post('/joueurs/', envoi);
      navigate(`/app/joueurs/${r.id}`);
    } catch (e: any) { setErreur({ ...(e.champs || {}), _: e.message } as any); }
  };
  if (id && existant.enCours && !existant.donnees) return <Chargement />;

  return (
    <>
      <Titre titre={id ? 'Modifier le joueur' : 'Nouveau joueur'} />
      <Card><div className="space-y-4">
        <Alerte ton="rouge">{(erreur as any)._}</Alerte>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Prénom" value={f.prenom} onChange={(e) => maj('prenom', e.target.value)} erreur={err('prenom')} />
          <Champ libelle="Nom" value={f.nom} onChange={(e) => maj('nom', e.target.value)} erreur={err('nom')} />
          <Choix libelle="Sexe" value={f.sexe} onChange={(e) => maj('sexe', e.target.value)}><option value="M">Masculin</option><option value="F">Féminin</option></Choix>
          <Champ libelle="Date de naissance" type="date" value={f.date_naissance} onChange={(e) => maj('date_naissance', e.target.value)} erreur={err('date_naissance')} />
          <Choix libelle="Poste" value={f.poste} onChange={(e) => maj('poste', e.target.value)}>{POSTES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
          <Choix libelle="Pied fort" value={f.pied_fort} onChange={(e) => maj('pied_fort', e.target.value)}><option value="D">Droit</option><option value="G">Gauche</option><option value="2">Les deux</option></Choix>
          <Choix libelle="Club" value={f.club_actuel} onChange={(e) => maj('club_actuel', e.target.value)}><option value="">— choisir —</option>{(clubs.donnees || []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix>
          {!id ? <Choix libelle="Contrat" value={f.type_contrat} onChange={(e) => maj('type_contrat', e.target.value)}><option value="PROFESSIONNEL">Professionnel</option><option value="AMATEUR">Amateur</option><option value="PRET">Prêt</option></Choix> : null}
          <Champ libelle="Nationalité" value={f.nationalite} onChange={(e) => maj('nationalite', e.target.value)} />
          <Champ libelle="Taille (cm)" type="number" value={f.taille} onChange={(e) => maj('taille', e.target.value)} />
          <Champ libelle="Poids (kg)" type="number" value={f.poids} onChange={(e) => maj('poids', e.target.value)} />
          <Champ libelle="Téléphone" value={f.telephone} onChange={(e) => maj('telephone', e.target.value)} />
          <Champ libelle="Courriel" type="email" value={f.courriel} onChange={(e) => maj('courriel', e.target.value)} />
        </div>
        {mineur ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Joueur mineur : protection renforcée des données (tuteur et accord écrit exigés).</p>
            <div className="grid gap-3 sm:grid-cols-2"><Champ libelle="Nom du tuteur" value={f.nom_tuteur} onChange={(e) => maj('nom_tuteur', e.target.value)} erreur={err('nom_tuteur')} /><Champ libelle="Lien (parent, tuteur légal…)" value={f.lien_tuteur} onChange={(e) => maj('lien_tuteur', e.target.value)} /></div>
            <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Accord écrit du tuteur (PDF ou image){existant.donnees?.accord_tuteur ? ' — un fichier est déjà enregistré' : ''}</span>
              <input type="file" accept=".pdf,image/*" onChange={(e) => setAccord(e.target.files?.[0] || null)} /></label>
            {err('accord_tuteur') ? <p className="text-xs text-brand-red">{err('accord_tuteur')}</p> : null}
          </div>) : null}
        <div className="flex gap-3"><Bouton onClick={enregistrer} disabled={!f.club_actuel}>Enregistrer</Bouton><Bouton genre="secondaire" onClick={() => navigate(-1)}>Annuler</Bouton></div>
      </div></Card>
    </>
  );
}

// CU06 : créer ou modifier un match, saisir les compositions, importer la vidéo
export function MatchForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState<any>({ competition: '', journee: '1', date_match: '', stade: '', club_domicile: '', club_exterieur: '', duree: '90', video_url: '' });
  const [compo, setCompo] = useState<Record<number, { club: number; titulaire: boolean; numero: string }>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const competitions = useChargement<any[]>(() => api.tout('/competitions/'), []);
  const existant = useChargement<any>(() => (id ? api.get(`/matchs/${id}/`) : null), [id]);
  const effD = useChargement<any[]>(() => (f.club_domicile ? api.tout('/joueurs/', { club: f.club_domicile }) : Promise.resolve([])), [f.club_domicile]);
  const effE = useChargement<any[]>(() => (f.club_exterieur ? api.tout('/joueurs/', { club: f.club_exterieur }) : Promise.resolve([])), [f.club_exterieur]);
  const comp = (competitions.donnees || []).find((c) => String(c.id) === String(f.competition));

  useEffect(() => {
    const m = existant.donnees; if (!m) return;
    setF({ competition: m.competition, journee: String(m.journee), date_match: m.date_match.slice(0, 16), stade: m.stade, club_domicile: m.club_domicile, club_exterieur: m.club_exterieur, duree: String(m.duree), video_url: m.video_url || '' });
    setCompo(Object.fromEntries(m.compositions.map((c: any) => [c.joueur, { club: c.club, titulaire: c.est_titulaire, numero: c.numero_maillot ? String(c.numero_maillot) : '' }])));
  }, [existant.donnees]);

  const bascule = (joueur: number, club: number) => setCompo((c) => { const n = { ...c }; if (n[joueur]) delete n[joueur]; else n[joueur] = { club, titulaire: Object.values(n).filter((x) => x.club === club && x.titulaire).length < 11, numero: '' }; return n; });
  const maj = (k: string, v: unknown) => setF({ ...f, [k]: v });

  const enregistrer = async () => {
    setErreur(null);
    const corps: any = { competition: Number(f.competition), journee: Number(f.journee), date_match: f.date_match, stade: f.stade, club_domicile: Number(f.club_domicile), club_exterieur: Number(f.club_exterieur), duree: Number(f.duree),
      compositions: Object.entries(compo).map(([joueur, c]) => ({ joueur: Number(joueur), club: c.club, est_titulaire: c.titulaire, numero_maillot: c.numero ? Number(c.numero) : null })) };
    try {
      const r = id ? await api.patch(`/matchs/${id}/`, corps) : await api.post('/matchs/', corps);
      if (f.video_url && f.video_url !== existant.donnees?.video_url) await api.post(`/matchs/${r.id}/importer-video/`, { video_url: f.video_url });
      navigate(`/app/matchs/${r.id}`);
    } catch (e) { setErreur((e as Error).message); }
  };
  const colonne = (club: number, nom: string, liste: any[] | null) => (
    <Card titre={`Composition · ${nom}`}>
      <p className="mb-2 text-xs text-slate-500">Cochez les joueurs retenus ; le XI (11 titulaires) se choisit avec « XI ».</p>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
        {(liste || []).map((j) => {
          const c = compo[j.id];
          return (<li key={j.id} className="flex items-center gap-2 py-1.5">
            <input type="checkbox" aria-label={j.nom_complet} checked={!!c} onChange={() => bascule(j.id, club)} />
            <span className="flex-1">{j.nom_complet} <span className="text-slate-400">{j.poste}</span></span>
            {c ? <><input aria-label="Numéro" placeholder="n°" type="number" min={1} max={99} value={c.numero} onChange={(e) => setCompo({ ...compo, [j.id]: { ...c, numero: e.target.value } })} className="w-14 rounded border border-slate-300 px-1 py-0.5" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={c.titulaire} onChange={(e) => setCompo({ ...compo, [j.id]: { ...c, titulaire: e.target.checked } })} />XI</label></> : null}
          </li>);
        })}
      </ul>
    </Card>
  );
  if (id && existant.enCours && !existant.donnees) return <Chargement />;
  const clubsDeLaCompetition: any[] = comp?.clubs_detail || [];

  return (
    <>
      <Titre titre={id ? 'Modifier le match' : 'Nouveau match'} />
      <div className="space-y-6">
        <Card><div className="space-y-4"><Alerte ton="rouge">{erreur}</Alerte>
          <div className="grid gap-3 sm:grid-cols-3">
            <Choix libelle="Compétition" value={f.competition} onChange={(e) => maj('competition', e.target.value)}><option value="">— choisir —</option>{(competitions.donnees || []).map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.saison_libelle}</option>)}</Choix>
            <Champ libelle="Journée" type="number" min={1} value={f.journee} onChange={(e) => maj('journee', e.target.value)} />
            <Champ libelle="Date et heure" type="datetime-local" value={f.date_match} onChange={(e) => maj('date_match', e.target.value)} />
            <Choix libelle="Équipe à domicile" value={f.club_domicile} onChange={(e) => maj('club_domicile', e.target.value)}><option value="">— choisir —</option>{clubsDeLaCompetition.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix>
            <Choix libelle="Équipe visiteuse" value={f.club_exterieur} onChange={(e) => maj('club_exterieur', e.target.value)}><option value="">— choisir —</option>{clubsDeLaCompetition.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</Choix>
            <Champ libelle="Stade" value={f.stade} onChange={(e) => maj('stade', e.target.value)} />
            <Champ libelle="Durée (minutes)" type="number" min={1} value={f.duree} onChange={(e) => maj('duree', e.target.value)} />
            <div className="sm:col-span-2"><Champ libelle="Adresse de la vidéo (MP4 ou flux web)" type="url" placeholder="https://…" value={f.video_url} onChange={(e) => maj('video_url', e.target.value)} /></div>
          </div></div></Card>
        {f.club_domicile && f.club_exterieur ? <div className="grid gap-6 lg:grid-cols-2">{colonne(Number(f.club_domicile), clubsDeLaCompetition.find((c) => String(c.id) === String(f.club_domicile))?.nom || 'Domicile', effD.donnees)}{colonne(Number(f.club_exterieur), clubsDeLaCompetition.find((c) => String(c.id) === String(f.club_exterieur))?.nom || 'Visiteuse', effE.donnees)}</div> : null}
        <div className="flex gap-3"><Bouton onClick={enregistrer} disabled={!f.competition || !f.club_domicile || !f.club_exterieur || !f.date_match}>Enregistrer</Bouton><Bouton genre="secondaire" onClick={() => navigate(-1)}>Annuler</Bouton></div>
      </div>
    </>
  );
}
