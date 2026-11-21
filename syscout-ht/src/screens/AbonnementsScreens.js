import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { api, exporterPdf } from '../api';
import { useAuth } from '../auth';
import { C, F } from '../theme';
import { MODES_PAIEMENT, TON_ETAT, aujourdhuiFR, dateFR, dateHeureFR, dateISO, htg } from '../constantes';
import { Ecran, Etat, Card, Info, Field, Select, Segmented, Button, Badge, Alert, Ligne, Rangee, Avatar, BoutonEntete, confirmer, useChargement, useFormulaire } from '../components/ui';

const ETATS = [[null, 'Tous'], ['EN_ATTENTE', 'En attente'], ['ACTIF', 'Actifs'], ['SUSPENDU', 'Suspendus']];
const TCA = 0.10;

// CU13 — Gérer un abonnement : clubs clients, formules et états
export function AbonnementsScreen({ navigation }) {
  const [etatAbo, setEtatAbo] = useState(null);
  const { donnees, ...etat } = useChargement(() => api.get('/abonnements/', { etat: etatAbo, page_size: 200 }), [etatAbo]);
  return (
    <Ecran titre="Abonnements" sousTitre="Clubs clients, factures et paiements"
      droite={<BoutonEntete titre="+ Nouveau" onPress={() => navigation.navigate('AbonnementForm')} />}>
      <Segmented options={ETATS} value={etatAbo} onChange={setEtatAbo} />
      <Etat {...etat} donnees={donnees} vide={donnees && !donnees.results.length ? 'Aucun abonnement.' : null} />
      {(donnees?.results || []).map((abo) => {
        const du = abo.factures.reduce((somme, facture) => somme + (facture.statut === 'ANNULEE' ? 0 : Number(facture.solde_du)), 0);
        return (
          <Ligne key={abo.id} titre={abo.club_nom}
            sousTitre={`${abo.formule_nom} · échéance ${dateFR(abo.date_echeance)}${du > 0 ? ` · solde dû ${htg(du)}` : ''}`}
            gauche={<Avatar nom={abo.club_nom} />} droite={<Badge text={abo.etat_libelle} tone={TON_ETAT[abo.etat]} />}
            onPress={() => navigation.navigate('AbonnementDetail', { id: abo.id })} />
        );
      })}
    </Ecran>
  );
}

export function AbonnementFormScreen({ navigation }) {
  const f = useFormulaire({ club: null, formule: null, date_debut: aujourdhuiFR(), duree_mois: '12' });
  const v = f.valeurs;
  const [clubs, setClubs] = useState([]);
  const [formules, setFormules] = useState([]);
  useEffect(() => {
    Promise.all([api.tout('/clubs/'), api.tout('/formules/')])
      .then(([listeClubs, listeFormules]) => { setClubs(listeClubs); setFormules(listeFormules); })
      .catch((e) => f.setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CU13 étape 4 : montant et date d'échéance (aperçu ; le serveur fait le calcul qui fait foi)
  const formule = formules.find((x) => x.id === v.formule);
  const duree = Number(v.duree_mois) || 0;
  const ht = formule ? Number(formule.prix_mensuel_htg) * duree : 0;

  const enregistrer = () => f.soumettre(async () => {
    const erreurs = {};
    const debut = dateISO(v.date_debut);
    if (!v.club) erreurs.club = 'Champ obligatoire';
    if (!v.formule) erreurs.formule = 'Champ obligatoire';
    if (!debut) erreurs.date_debut = 'Date invalide (JJ/MM/AAAA)';
    if (duree < 1) erreurs.duree_mois = 'Au moins 1 mois';
    if (Object.keys(erreurs).length) { f.setErreurs(erreurs); f.setMessage('Complétez les champs signalés en rouge.'); return; }
    const abo = await api.post('/abonnements/', { club: v.club, formule: v.formule, date_debut: debut, duree_mois: duree });
    navigation.replace('AbonnementDetail', { id: abo.id });
  });

  return (
    <Ecran titre="Nouvel abonnement" sousTitre="Abonnements">
      <Alert tone="e" text={f.message} />
      <Card>
        <Select label="Club client" required options={clubs.map((c) => [c.id, `${c.nom} · ${c.ville}`])} value={v.club} onChange={f.changer('club')}
          state={f.erreurs.club ? 'error' : undefined} hint={f.erreurs.club} />
        <Select label="Formule" required value={v.formule} onChange={f.changer('formule')}
          options={formules.map((x) => [x.id, `${x.nom} · ${htg(x.prix_mensuel_htg)} / mois`])}
          state={f.erreurs.formule ? 'error' : undefined}
          hint={f.erreurs.formule || (formule ? `${formule.divisions_incluses.join(', ')} · ${formule.nombre_comptes} compte(s) · rapports ${formule.rapports_inclus ? 'inclus' : 'non inclus'}` : undefined)} />
        <Rangee>
          <Field label="Date de début" required placeholder="JJ/MM/AAAA" {...f.lier('date_debut')} style={{ flex: 1.5 }} />
          <Field label="Durée (mois)" required keyboardType="number-pad" {...f.lier('duree_mois')} style={{ flex: 1 }} />
        </Rangee>
      </Card>
      {formule && duree > 0 ? (
        <Card title="Facture qui sera générée">
          <Info libelle="Montant hors taxe" valeur={htg(ht)} />
          <Info libelle="Taxe sur le chiffre d'affaires (10 %)" valeur={htg(ht * TCA)} />
          <Info libelle="Total à payer" valeur={htg(ht * (1 + TCA))} />
          <View style={{ height: 8 }} />
        </Card>
      ) : null}
      <Rangee style={{ marginBottom: 10 }}>
        <Button title="Annuler" kind="secondary" style={{ flex: 1 }} onPress={navigation.goBack} />
        <Button title="Enregistrer" style={{ flex: 2 }} onPress={enregistrer} loading={f.envoi} />
      </Rangee>
    </Ecran>
  );
}

// CU14 — Enregistrer un paiement : facture, solde dû, reçu
function Paiement({ facture, surPaiement }) {
  const f = useFormulaire({ montant: String(facture.solde_du), mode: 'ESPECES', reference: '' });
  const v = f.valeurs;
  const enregistrer = () => f.soumettre(async () => {
    const montant = Number(String(v.montant).replace(/\s/g, '').replace(',', '.'));
    if (!(montant > 0)) { f.setErreurs({ montant_htg: 'Montant invalide' }); return; }
    surPaiement(await api.post('/paiements/', { facture: facture.id, montant_htg: montant.toFixed(2), mode: v.mode, reference: v.reference }));
  });
  return (
    <View style={st.paiement}>
      <Alert tone="e" text={f.message} />
      <Rangee>
        <Field label="Montant (HTG)" required keyboardType="decimal-pad" value={v.montant} onChangeText={f.changer('montant')} style={{ flex: 1 }}
          state={f.erreurs.montant_htg ? 'error' : undefined} hint={f.erreurs.montant_htg} />
        <Field label="Référence" {...f.lier('reference')} style={{ flex: 1 }} />
      </Rangee>
      <Segmented label="Mode de paiement" options={MODES_PAIEMENT} value={v.mode} onChange={f.changer('mode')} />
      <Button title="Enregistrer le paiement" kind="success" onPress={enregistrer} loading={f.envoi} style={{ marginBottom: 4 }} />
    </View>
  );
}

export function AbonnementDetailScreen({ route }) {
  const { id } = route.params;
  const { a } = useAuth();
  const [message, setMessage] = useState(null);
  const [succes, setSucces] = useState(null);
  const [ouverte, setOuverte] = useState(null);
  const { donnees: abo, recharger, ...etat } = useChargement(() => api.get(`/abonnements/${id}/`), [id]);

  const essayer = async (action) => {
    setMessage(null);
    try { await action(); } catch (e) { setMessage(e.message); }
  };
  const pdf = (type, identifiant) => essayer(() => exporterPdf({ type, id: identifiant }));
  const surPaiement = (paiement) => {
    setOuverte(null);
    setSucces(`Paiement de ${htg(paiement.montant_htg)} enregistré.${paiement.abonnement_etat === 'ACTIF' ? " L'abonnement est actif." : ` Solde restant : ${htg(paiement.solde_du)}.`}`);
    recharger();
  };
  const renouveler = () => essayer(async () => {
    if (!(await confirmer('Renouveler', 'Émettre la facture de la période suivante ?'))) return;
    await api.post(`/abonnements/${id}/renouveler/`);
    recharger();
  });
  const resilier = () => essayer(async () => {
    if (!(await confirmer('Résilier', 'Voulez-vous vraiment résilier cet abonnement ? Le club perdra son accès.'))) return;
    await api.post(`/abonnements/${id}/resilier/`);
    recharger();
  });
  const annulerPaiement = (paiement) => essayer(async () => {
    if (!(await confirmer('Annuler le paiement', `Annuler le paiement de ${htg(paiement.montant_htg)} ? Il restera dans l'historique, marqué annulé.`))) return;
    await api.post(`/paiements/${paiement.id}/annuler/`, { motif: "Annulé par l'administrateur avec l'accord de la direction" });
    recharger();
  });

  return (
    <Ecran titre={abo ? abo.club_nom : 'Abonnement'} sousTitre={abo ? `Formule ${abo.formule_nom}` : null}
      droite={abo ? <Badge text={abo.etat_libelle} tone={TON_ETAT[abo.etat]} /> : null}>
      <Etat {...etat} recharger={recharger} donnees={abo} />
      {abo ? (
        <>
          <Alert tone="e" text={message} />
          <Alert tone="s" text={succes} />
          {abo.etat === 'SUSPENDU' ? <Alert text="Abonnement suspendu : impayé plus de 15 jours après l'échéance (RG10). Il redevient actif au paiement." /> : null}
          <Card>
            <Info libelle="Formule" valeur={abo.formule_nom} />
            <Info libelle="Début" valeur={dateFR(abo.date_debut)} />
            <Info libelle="Échéance" valeur={dateFR(abo.date_echeance)} />
            <Info libelle="Durée" valeur={`${abo.duree_mois} mois`} />
            <Info libelle="Montant hors taxe" valeur={htg(abo.montant_htg)} />
            <View style={{ height: 8 }} />
          </Card>

          {abo.factures.map((facture) => (
            <Card key={facture.id} title={`Facture ${facture.numero_facture}`} badge={<Badge text={facture.statut_libelle} tone={TON_ETAT[facture.statut]} />}>
              <Info libelle="Période" valeur={`${dateFR(facture.periode_debut)} → ${dateFR(facture.periode_fin)}`} />
              <Info libelle="À régler avant le" valeur={dateFR(facture.date_echeance)} />
              <Info libelle="Total TTC" valeur={htg(facture.montant_ttc)} />
              <Info libelle="Solde dû" valeur={<Text style={[st.solde, Number(facture.solde_du) > 0 && { color: C.red }]}>{htg(facture.solde_du)}</Text>} />
              {facture.paiements.map((paiement) => (
                <View key={paiement.id} style={st.ligne}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.pTitre, paiement.annule && st.barre]}>{htg(paiement.montant_htg)} · {paiement.mode_libelle}</Text>
                    <Text style={st.pSous}>{dateHeureFR(paiement.date_paiement)} · {paiement.encaisse_par_nom}{paiement.reference ? ` · ${paiement.reference}` : ''}{paiement.annule ? ' · ANNULÉ' : ''}</Text>
                  </View>
                  <Text style={st.lien} onPress={() => pdf('recu', paiement.id)}>Reçu</Text>
                  {a('ADMIN') && !paiement.annule ? <Text style={[st.lien, { color: C.red }]} onPress={() => annulerPaiement(paiement)}>Annuler</Text> : null}
                </View>
              ))}
              <Rangee style={{ marginVertical: 10 }}>
                <Button title="Facture PDF" kind="secondary" style={{ flex: 1, height: 42 }} onPress={() => pdf('facture', facture.id)} />
                {Number(facture.solde_du) > 0 && facture.statut !== 'ANNULEE' ? (
                  <Button title={ouverte === facture.id ? 'Fermer' : 'Encaisser'} style={{ flex: 1, height: 42 }}
                    onPress={() => { setSucces(null); setOuverte(ouverte === facture.id ? null : facture.id); }} />
                ) : null}
              </Rangee>
              {ouverte === facture.id ? <Paiement facture={facture} surPaiement={surPaiement} /> : null}
            </Card>
          ))}

          <Rangee style={{ marginBottom: 10 }}>
            {['ACTIF', 'EXPIRE'].includes(abo.etat) ? <Button title="Renouveler" kind="secondary" style={{ flex: 1 }} onPress={renouveler} /> : null}
            {!['RESILIE', 'EXPIRE'].includes(abo.etat) ? <Button title="Résilier" kind="danger" style={{ flex: 1 }} onPress={resilier} /> : null}
          </Rangee>
        </>
      ) : null}
    </Ecran>
  );
}

const st = StyleSheet.create({
  solde: { fontSize: 13, color: C.green, ...F.bold },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f1f3' },
  pTitre: { fontSize: 13.5, color: C.ink, ...F.semi },
  pSous: { fontSize: 11.5, color: C.muted, marginTop: 2, ...F.regular },
  barre: { textDecorationLine: 'line-through', color: C.muted },
  lien: { fontSize: 13, color: C.blue, ...F.semi },
  paiement: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, marginBottom: 10 },
});
