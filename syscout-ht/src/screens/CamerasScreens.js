import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { dateHeureFR } from '../constantes';
import { Ecran, Etat, Card, Field, Segmented, Button, Badge, Alert, Ligne, Rangee, BoutonEntete, Check, confirmer, useChargement, useFormulaire, s } from '../components/ui';

export const TON_CAMERA = { EN_LIGNE: 'g', HORS_LIGNE: 'r', ERREUR: 'r', NON_TESTEE: 'n' };
const PROTOCOLES = [['RTSP', 'RTSP'], ['HLS', 'HLS'], ['HTTP', 'MP4']];
const RESOLUTIONS = [['1280x720', '720p'], ['1920x1080', '1080p'], ['2560x1440', '1440p'], ['3840x2160', '4K']];
const FPS = [[25, '25'], [30, '30'], [50, '50'], [60, '60']];

// état et qualité du flux (FR-041) en une ligne
export function qualite(c) {
  const morceaux = [`${c.hauteur}p · ${c.fps} i/s`];
  if (c.latence_ms != null && c.etat === 'EN_LIGNE') morceaux.push(`répond en ${c.latence_ms} ms`);
  if (c.derniere_verification) morceaux.push(`vérifiée ${dateHeureFR(c.derniere_verification)}`);
  return morceaux.join(' · ');
}

// ---------------------------------------------------------------- MOD-05 — Caméras des stades
export function CamerasScreen({ navigation }) {
  const { a } = useAuth();
  const [message, setMessage] = useState(null);
  const [enVerification, setEnVerification] = useState(null);
  const { donnees, recharger, ...etat } = useChargement(() => api.tout('/cameras/'), []);
  const parStade = {};
  (donnees || []).forEach((c) => { (parStade[c.stade] = parStade[c.stade] || []).push(c); });

  const verifier = async (c) => {
    setEnVerification(c.id);
    setMessage(null);
    try { await api.post(`/cameras/${c.id}/verifier/`); recharger(); } catch (e) { setMessage(e.message); }
    setEnVerification(null);
  };

  return (
    <Ecran titre="Caméras" sousTitre={donnees ? `${donnees.length} caméra(s)` : null}
      droite={a('ADMIN') ? <BoutonEntete titre="+ Nouvelle" onPress={() => navigation.navigate('CameraForm')} /> : null}>
      <Etat {...etat} recharger={recharger} donnees={donnees} vide={donnees && !donnees.length ? "Aucune caméra installée. L'administrateur les ajoute avec « + Nouvelle »." : null} />
      <Alert tone="e" text={message} />
      {Object.entries(parStade).map(([stade, cameras]) => (
        <Card key={stade} title={stade}>
          {cameras.map((c) => (
            <Ligne key={c.id} titre={`${c.nom}${c.active ? '' : ' (désactivée)'}`}
              sousTitre={`${c.protocole_libelle} · ${qualite(c)}${c.message_etat && c.etat !== 'EN_LIGNE' ? `\n${c.message_etat}` : ''}${c.match_en_cours ? '\n● Filme un match en ce moment' : ''}`}
              droite={<Badge text={enVerification === c.id ? 'Vérification…' : c.etat_libelle} tone={enVerification === c.id ? 'b' : TON_CAMERA[c.etat]} />}
              onPress={() => (a('ADMIN') ? navigation.navigate('CameraForm', { id: c.id }) : verifier(c))} />
          ))}
          <Button title="Vérifier les caméras de ce stade" kind="secondary" style={{ marginTop: 10 }}
            onPress={async () => { for (const c of cameras.filter((x) => x.active)) await verifier(c); }} />
        </Card>
      ))}
    </Ecran>
  );
}

export function CameraFormScreen({ navigation, route }) {
  const id = route.params?.id;
  const f = useFormulaire({ nom: '', stade: '', protocole: 'RTSP', url_flux: '', url_lecture: '', resolution: '1920x1080', fps: 25, active: true });
  const v = f.valeurs;
  const [camera, setCamera] = useState(null);
  useEffect(() => {
    if (!id) return;
    api.get(`/cameras/${id}/`).then((c) => {
      setCamera(c);
      f.setValeurs({ ...c, url_flux: '', url_lecture: c.url_lecture || '', resolution: `${c.largeur}x${c.hauteur}` });
    }).catch((e) => f.setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    if (!v.nom.trim()) erreurs.nom = 'Champ obligatoire';
    if (!v.stade.trim()) erreurs.stade = 'Champ obligatoire';
    if (!id && !v.url_flux.trim()) erreurs.url_flux = 'Champ obligatoire';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    const [largeur, hauteur] = v.resolution.split('x').map(Number);
    const corps = {
      nom: v.nom.trim(), stade: v.stade.trim(), protocole: v.protocole, url_lecture: v.url_lecture.trim(), largeur, hauteur,
      fps: v.fps, active: v.active,
      // en modification, l'adresse du flux (qui peut contenir un mot de passe) n'est renvoyée que si elle change
      ...(v.url_flux.trim() ? { url_flux: v.url_flux.trim() } : {}),
    };
    const c = id ? await api.patch(`/cameras/${id}/`, corps) : await api.post('/cameras/', corps);
    await api.post(`/cameras/${c.id}/verifier/`).catch(() => {});
    navigation.goBack();
  });
  const supprimer = async () => {
    if (!(await confirmer('Supprimer', 'Supprimer cette caméra ? Une caméra qui a déjà filmé un match ne peut qu\'être désactivée.'))) return;
    f.soumettre(async () => { await api.delete(`/cameras/${id}/`); navigation.goBack(); });
  };
  const exemple = v.protocole === 'RTSP' ? 'rtsp://utilisateur:motdepasse@192.168.1.20:554/stream1' : 'https://…/live.m3u8';

  return (
    <Ecran titre={id ? 'Modifier la caméra' : 'Nouvelle caméra'} sousTitre="Caméras">
      <Alert tone="e" text={f.message} />
      {camera ? <Alert tone={camera.etat === 'EN_LIGNE' ? 's' : 'w'} text={`${camera.etat_libelle} · ${qualite(camera)}${camera.message_etat ? `\n${camera.message_etat}` : ''}`} /> : null}
      <Card>
        <Rangee>
          <Field label="Nom" required placeholder="ex. Tribune centrale" {...f.lier('nom')} style={{ flex: 1 }} />
          <Field label="Stade" required placeholder="ex. Parc Pinchinat" {...f.lier('stade')} style={{ flex: 1.3 }} />
        </Rangee>
        <Segmented label="Protocole" options={PROTOCOLES} value={v.protocole} onChange={f.changer('protocole')} />
        <Field label="Adresse du flux" required={!id} autoCapitalize="none" placeholder={id ? camera?.url_flux_affichee : exemple} {...f.lier('url_flux')}
          hint={f.erreurs.url_flux || (id ? 'Laissez vide pour garder l\'adresse actuelle (le mot de passe n\'est jamais réaffiché).' : `Exemple : ${exemple}`)} />
        <Field label="Adresse de lecture (HLS ou MP4)" autoCapitalize="none" {...f.lier('url_lecture')}
          hint={f.erreurs.url_lecture || 'Ce que l\'application lit pendant le codage. Une caméra RTSP passe par un serveur de diffusion qui la convertit en HLS.'} />
        <Segmented label="Résolution" options={RESOLUTIONS} value={v.resolution} onChange={f.changer('resolution')} />
        <Segmented label="Images par seconde" options={FPS} value={v.fps} onChange={f.changer('fps')} />
        <Check on={v.active} onPress={() => f.changer('active')(!v.active)} label="Caméra en service" />
        {camera?.calibrage ? <Text style={[s.ligneS, { marginTop: 8 }]}>Image calibrée sur : {camera.calibrage.reference === 'TERRAIN' ? 'le terrain entier' : camera.calibrage.reference === 'MOITIE' ? 'une moitié de terrain' : 'la surface de réparation'} (depuis l'écran de codage).</Text> : null}
      </Card>
      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer et vérifier" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
      </Rangee>
      {id ? <Button title="Supprimer" kind="danger" style={{ marginBottom: 10 }} onPress={supprimer} /> : null}
    </Ecran>
  );
}
