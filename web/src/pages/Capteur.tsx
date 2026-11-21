import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useChargement } from '../lib/hooks';
import { Alerte, Badge, Bouton, Card, Choix, Etat, Titre } from '../components/ui';

interface PointGps { t: number; lat: number; lon: number }

// Lit une trace GPX (<trkpt lat lon><time>) ou CSV (« t,lat,lon » ; t en secondes) en points relatifs au premier instant.
function lireTrace(texte: string, nom: string): PointGps[] {
  if (nom.toLowerCase().endsWith('.gpx') || texte.trimStart().startsWith('<')) {
    const doc = new DOMParser().parseFromString(texte, 'application/xml');
    const pts = Array.from(doc.getElementsByTagName('trkpt')).map((p) => ({ lat: Number(p.getAttribute('lat')), lon: Number(p.getAttribute('lon')), ms: Date.parse(p.getElementsByTagName('time')[0]?.textContent || '') }));
    const valides = pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.ms));
    return valides.map((p) => ({ t: (p.ms - valides[0].ms) / 1000, lat: p.lat, lon: p.lon }));
  }
  return texte.split(/\r?\n/).map((l) => l.split(/[;,]/).map((x) => Number(x.trim()))).filter((c) => c.length >= 3 && c.every(Number.isFinite)).map(([t, lat, lon]) => ({ t, lat, lon }));
}

// Capteur GPS : le téléphone porté par le joueur enregistre sa trace (ou on importe un fichier GPX / CSV) ; le serveur en
// tire distance, sprints et vitesse maximale. La géolocalisation du navigateur exige HTTPS (ou localhost).
export default function Capteur() {
  const { id } = useParams();
  const [joueur, setJoueur] = useState('');
  const [points, setPoints] = useState<PointGps[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [precision, setPrecision] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<any | null>(null);
  const suivi = useRef<number | null>(null);
  const debut = useRef<number>(0);
  const match = useChargement<any>(() => api.get(`/matchs/${id}/`), [id]);

  const arreter = () => { if (suivi.current !== null) navigator.geolocation.clearWatch(suivi.current); suivi.current = null; setEnCours(false); };
  useEffect(() => arreter, []);

  const demarrer = () => {
    setErreur(null); setResultat(null);
    if (!navigator.geolocation) return setErreur("La géolocalisation n'est pas disponible dans ce navigateur.");
    setPoints([]); debut.current = Date.now(); setEnCours(true);
    suivi.current = navigator.geolocation.watchPosition(
      (p) => { setPrecision(Math.round(p.coords.accuracy)); setPoints((x) => [...x, { t: (p.timestamp - debut.current) / 1000, lat: p.coords.latitude, lon: p.coords.longitude }]); },
      (e) => { setErreur(e.code === 1 ? 'Position refusée : autorisez la localisation pour ce site.' : `Position indisponible : ${e.message}`); arreter(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  };
  const importer = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setErreur(null); setResultat(null);
    const pts = lireTrace(await f.text(), f.name);
    if (pts.length < 4) setErreur('Trace illisible ou trop courte (4 positions au moins : GPX avec <time>, ou CSV « t,lat,lon »).'); else setPoints(pts);
    e.target.value = '';
  };
  const envoyer = async () => {
    setErreur(null);
    try { setResultat(await api.post(`/matchs/${id}/gps/`, { joueur: Number(joueur), points })); setPoints([]); } catch (x) { setErreur((x as Error).message); }
  };
  const m = match.donnees;

  return (
    <>
      <Titre titre="Capteur GPS" sous={m ? <>{m.domicile_nom} – {m.exterieur_nom} · <Link className="text-brand-blue hover:underline" to={`/app/matchs/${id}`}>fiche du match</Link></> : undefined} />
      <Etat {...match}>
        <Card className="max-w-2xl">
          <div className="space-y-4">
            <Alerte ton="bleu">Le joueur porte l'appareil pendant le match. La trace est analysée à l'envoi : distance, distance en sprint, nombre de sprints et vitesse maximale. Elle remplace ses données physiques du match.</Alerte>
            <Alerte ton="rouge">{erreur}</Alerte>
            <Choix libelle="Joueur" value={joueur} onChange={(e) => setJoueur(e.target.value)}><option value="">— choisir dans la composition —</option>{(m?.compositions || []).map((c: any) => <option key={c.joueur} value={c.joueur}>{c.joueur_nom}</option>)}</Choix>
            <div className="flex flex-wrap items-center gap-3">
              {enCours ? <Bouton genre="danger" onClick={arreter}>Arrêter</Bouton> : <Bouton onClick={demarrer}>Enregistrer avec cet appareil</Bouton>}
              <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Importer un fichier GPX / CSV<input type="file" accept=".gpx,.csv,.txt" className="hidden" onChange={importer} /></label>
              {enCours ? <Badge ton="rouge">● enregistrement · {points.length} positions{precision != null ? ` · ±${precision} m` : ''}</Badge> : points.length ? <Badge ton="bleu">{points.length} positions prêtes</Badge> : null}
            </div>
            <Bouton genre="succes" onClick={envoyer} disabled={enCours || points.length < 4 || !joueur}>Envoyer la trace</Bouton>
            {resultat ? <Alerte ton="vert">Enregistré : {Math.round(resultat.distance_m)} m parcourus, {Math.round(resultat.distance_sprint_m)} m en sprint, {resultat.sprints} sprint(s), vitesse max {String(resultat.vitesse_max_kmh).replace('.', ',')} km/h.</Alerte> : null}
          </div>
        </Card>
      </Etat>
    </>
  );
}
