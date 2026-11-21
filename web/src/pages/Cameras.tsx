import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TON_ETAT, dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import Modal from '../components/Modal';
import VideoAnnotable from '../components/VideoAnnotable';
import { Alerte, Badge, Bouton, Card, Champ, Choix, Etat, Titre, Vide } from '../components/ui';

type Point = [number, number];
const REFERENCES: [string, string][] = [['TERRAIN', 'Terrain entier (105 × 68 m)'], ['MOITIE', 'Moitié de terrain (52,5 × 68 m)'], ['SURFACE', 'Surface de réparation (16,5 × 40,3 m)']];
const COINS = ['haut-gauche', 'haut-droit', 'bas-droit', 'bas-gauche'];
const RESOLUTIONS: [string, string][] = [['1280x720', '720p'], ['1920x1080', '1080p'], ['2560x1440', '1440p'], ['3840x2160', '4K']];
const VIDE = { nom: '', stade: '', protocole: 'RTSP', url_flux: '', url_lecture: '', resolution: '1920x1080', fps: 25, active: true };

// MOD-05 : l'administrateur installe les caméras ; l'analyste vérifie le flux et calibre l'image sur le terrain (FR-043).
export default function Cameras() {
  const { a } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [verif, setVerif] = useState<number | null>(null);
  const [edition, setEdition] = useState<any | null>(null);
  const [calib, setCalib] = useState<{ camera: any; reference: string; coins: Point[] } | null>(null);
  const t = useChargement<any[]>(() => api.tout('/cameras/'), []);
  const parStade: Record<string, any[]> = {};
  (t.donnees || []).forEach((c) => { (parStade[c.stade] ||= []).push(c); });
  const admin = a('ADMIN');

  const verifier = async (c: any) => {
    setVerif(c.id); setMessage(null);
    try { await api.post(`/cameras/${c.id}/verifier/`); await t.recharger(); } catch (e) { setMessage((e as Error).message); }
    setVerif(null);
  };
  const sauver = async () => {
    setMessage(null);
    const [largeur, hauteur] = edition.resolution.split('x').map(Number);
    const corps: any = { nom: edition.nom, stade: edition.stade, protocole: edition.protocole, url_lecture: edition.url_lecture, largeur, hauteur, fps: Number(edition.fps), active: edition.active };
    if (edition.url_flux) corps.url_flux = edition.url_flux; // l'adresse du flux ne se relit pas : vide = inchangée
    try { if (edition.id) await api.patch(`/cameras/${edition.id}/`, corps); else await api.post('/cameras/', corps); setEdition(null); t.recharger(); } catch (e) { setMessage((e as Error).message); }
  };
  const supprimer = async (c: any) => { if (!window.confirm(`Supprimer la caméra ${c.nom} ?`)) return; try { await api.delete(`/cameras/${c.id}/`); t.recharger(); } catch (e) { setMessage((e as Error).message); } };
  const calibrer = async () => {
    if (!calib || calib.coins.length !== 4) return;
    setMessage(null);
    try { await api.post(`/cameras/${calib.camera.id}/calibrer/`, { reference: calib.reference, coins: calib.coins }); setCalib(null); t.recharger(); } catch (e) { setMessage((e as Error).message); }
  };
  const maj = (k: string, v: unknown) => setEdition({ ...edition, [k]: v });
  const refVideo = useRef<HTMLVideoElement | null>(null);

  return (
    <>
      <Titre titre="Caméras" sous="Caméras des stades : état du flux, qualité et calibrage du terrain."
        droite={admin ? <Bouton onClick={() => { setEdition({ ...VIDE }); setMessage(null); }}>+ Nouvelle caméra</Bouton> : undefined} />
      <div className="mb-4"><Alerte ton="rouge">{message}</Alerte></div>
      <Etat {...t}>
        {t.donnees && !t.donnees.length ? <Vide>Aucune caméra installée.{admin ? ' Ajoutez-la avec « + Nouvelle caméra ».' : ''}</Vide> : null}
        <div className="space-y-6">
          {Object.entries(parStade).map(([stade, cameras]) => (
            <Card key={stade} titre={stade}>
              <ul className="divide-y divide-slate-100">
                {cameras.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy">{c.nom} <Badge ton={TON_ETAT[c.etat]}>{c.etat_libelle}</Badge>{!c.active ? <span className="ml-2"><Badge>Inactive</Badge></span> : null}</p>
                      <p className="text-slate-500">{c.protocole_libelle} · {c.hauteur}p · {c.fps} i/s{c.latence_ms != null && c.etat === 'EN_LIGNE' ? ` · répond en ${c.latence_ms} ms` : ''}{c.derniere_verification ? ` · vérifiée ${dateHeureFR(c.derniere_verification)}` : ''}</p>
                      <p className="truncate text-xs text-slate-400">{c.url_flux_affichee}{c.message_etat ? ` — ${c.message_etat}` : ''}</p>
                      <p className="text-xs text-slate-400">{c.calibrage ? `Terrain calibré (${c.calibrage.reference})` : 'Terrain non calibré (FR-043)'}{c.match_en_cours ? ' · filme un match' : ''}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Bouton genre="secondaire" disabled={verif === c.id} onClick={() => verifier(c)}>{verif === c.id ? 'Vérification…' : 'Vérifier'}</Bouton>
                      <Bouton genre="secondaire" onClick={() => { setCalib({ camera: c, reference: c.calibrage?.reference || 'TERRAIN', coins: c.calibrage?.coins || [] }); setMessage(null); }}>Calibrer</Bouton>
                      {admin ? <><Bouton genre="secondaire" onClick={() => { setEdition({ ...c, url_flux: '', resolution: `${c.largeur}x${c.hauteur}` }); setMessage(null); }}>Modifier</Bouton><Bouton genre="secondaire" onClick={() => supprimer(c)}>Supprimer</Bouton></> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Etat>

      <Modal titre={edition?.id ? 'Modifier la caméra' : 'Nouvelle caméra'} ouvert={!!edition} onFermer={() => setEdition(null)}>
        {edition ? (
          <div className="space-y-3">
            <Alerte ton="rouge">{message}</Alerte>
            <div className="grid grid-cols-2 gap-3"><Champ libelle="Nom" value={edition.nom} onChange={(e) => maj('nom', e.target.value)} /><Champ libelle="Stade (même libellé que les matchs)" value={edition.stade} onChange={(e) => maj('stade', e.target.value)} /></div>
            <Choix libelle="Protocole" value={edition.protocole} onChange={(e) => maj('protocole', e.target.value)}><option value="RTSP">RTSP (caméra IP)</option><option value="HLS">HLS (flux web)</option><option value="HTTP">Vidéo HTTP (MP4)</option></Choix>
            <Champ libelle={edition.id ? "Adresse du flux (laisser vide pour ne pas la changer)" : 'Adresse du flux'} placeholder="rtsp://utilisateur:mot-de-passe@192.168.1.20/stream1" value={edition.url_flux} onChange={(e) => maj('url_flux', e.target.value)} autoComplete="off" />
            <Champ libelle="Adresse de lecture (HLS ou MP4, pour les navigateurs)" type="url" value={edition.url_lecture || ''} onChange={(e) => maj('url_lecture', e.target.value)} />
            <div className="grid grid-cols-3 gap-3">
              <Choix libelle="Résolution" value={edition.resolution} onChange={(e) => maj('resolution', e.target.value)}>{RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
              <Choix libelle="Images / s" value={edition.fps} onChange={(e) => maj('fps', e.target.value)}>{[25, 30, 50, 60].map((f) => <option key={f} value={f}>{f}</option>)}</Choix>
              <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={edition.active} onChange={(e) => maj('active', e.target.checked)} /> Active</label>
            </div>
            <p className="text-xs text-slate-500">L'adresse du flux peut contenir un mot de passe : elle n'est jamais relue en clair.</p>
            <Bouton onClick={sauver} disabled={!edition.nom || !edition.stade || (!edition.id && !edition.url_flux)}>Enregistrer</Bouton>
          </div>
        ) : null}
      </Modal>

      <Modal titre={`Calibrer · ${calib?.camera.nom || ''}`} ouvert={!!calib} onFermer={() => setCalib(null)} large>
        {calib ? (
          <div className="space-y-3">
            <Alerte ton="bleu">Désignez sur l'image les 4 coins du rectangle de référence, dans l'ordre : haut-gauche, haut-droit, bas-droit, bas-gauche. Le prochain à placer : <b>{COINS[calib.coins.length] || 'terminé'}</b>.</Alerte>
            <Choix libelle="Rectangle de référence" value={calib.reference} onChange={(e) => setCalib({ ...calib, reference: e.target.value })}>{REFERENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Choix>
            <VideoAnnotable src={calib.camera.url_lecture || undefined} refVideo={refVideo} capture={calib.coins.length < 4}
              onPoint={(x, y) => setCalib((c) => (c && c.coins.length < 4 ? { ...c, coins: [...c.coins, [x, y]] } : c))}
              rendu={() => <>
                {calib.coins.length >= 2 ? <polyline points={[...calib.coins, ...(calib.coins.length === 4 ? [calib.coins[0]] : [])].map((p) => p.join(',')).join(' ')} fill="none" stroke="#20B56B" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
                {calib.coins.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r={1} fill="#20B56B" /><text x={p[0] + 1.5} y={p[1] - 1.5} fontSize={3.5} fill="#fff" stroke="#000" strokeWidth={0.1}>{i + 1}</text></g>)}
              </>} />
            {!calib.camera.url_lecture ? <Alerte>Cette caméra n'a pas d'adresse de lecture : saisissez les 4 coins à la main (en % de l'image).</Alerte> : null}
            {!calib.camera.url_lecture ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{COINS.map((nom, i) => (
                <div key={nom}><p className="mb-1 text-xs font-medium text-slate-600">{nom}</p><div className="flex gap-1">
                  {[0, 1].map((k) => <input key={k} type="number" min={0} max={100} step={0.1} aria-label={`${nom} ${k ? 'y' : 'x'}`} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" value={calib.coins[i]?.[k] ?? ''}
                    onChange={(e) => { const c = [...calib.coins] as Point[]; while (c.length < 4) c.push([0, 0]); c[i] = k ? [c[i][0], Number(e.target.value)] : [Number(e.target.value), c[i][1]]; setCalib({ ...calib, coins: c }); }} />)}</div></div>))}</div>) : null}
            <div className="flex gap-2"><Bouton genre="secondaire" onClick={() => setCalib({ ...calib, coins: [] })}>Recommencer</Bouton><Bouton genre="succes" onClick={calibrer} disabled={calib.coins.length !== 4}>Enregistrer le calibrage</Bouton></div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
