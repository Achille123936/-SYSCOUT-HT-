import { api } from '../lib/api';
import { dateHeureFR } from '../lib/format';
import { useChargement } from '../lib/hooks';
import { Alerte, Card, Etat, Titre } from '../components/ui';

const Chiffre = ({ valeur, libelle, detail }: { valeur: unknown; libelle: string; detail?: string }) => (
  <div className="rounded-xl border border-slate-200 p-4">
    <p className="text-2xl font-extrabold text-navy">{valeur === null || valeur === undefined ? '—' : String(valeur)}</p>
    <p className="text-sm text-slate-600">{libelle}</p>{detail ? <p className="mt-1 text-xs text-slate-400">{detail}</p> : null}
  </div>
);

// SRS §2.1 : indicateurs de réussite. Ce que le serveur ne peut pas mesurer lui-même reste vide, avec la façon de le mesurer.
export default function Indicateurs() {
  const t = useChargement<any>(() => api.get('/indicateurs/'), []);
  const d = t.donnees;
  const pct = (v: number | null) => (v === null ? null : `${String(v).replace('.', ',')} %`);

  return (
    <>
      <Titre titre="Indicateurs de réussite" sous={d ? `Calculés le ${dateHeureFR(d.genere_le)}` : undefined} />
      <Etat {...t}>
        {d ? (
          <div className="space-y-6">
            <Card titre="Couverture">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Chiffre valeur={d.couverture.clubs} libelle="clubs" /><Chiffre valeur={d.couverture.competitions} libelle="compétitions" />
                <Chiffre valeur={d.couverture.joueurs} libelle="joueurs" /><Chiffre valeur={d.couverture.matchs} libelle="matchs" />
                <Chiffre valeur={d.couverture.matchs_codes} libelle="matchs codés et publiés" />
              </div>
            </Card>
            <Card titre="Qualité des données">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Chiffre valeur={d.qualite_donnees.evenements} libelle="événements officiels" detail={`dont ${d.qualite_donnees.evenements_ia} issus de l'IA`} />
                <Chiffre valeur={pct(d.qualite_donnees.part_validee_pct)} libelle="part validée" detail="tout événement officiel est validé par un analyste" />
                <Chiffre valeur={pct(d.qualite_donnees.taux_erreurs_detectees_pct)} libelle="erreurs de l'IA détectées" detail="propositions corrigées ou rejetées parmi les décidées" />
                <Chiffre valeur={d.qualite_donnees.propositions.en_attente} libelle="propositions en attente" detail={`${d.qualite_donnees.propositions.non_verifiees} non vérifiées`} />
              </div>
            </Card>
            <Card titre="Performance de l'IA">
              <Alerte ton="bleu">Non mesurable par le serveur : {d.performance_ia.mesure}. Précision, rappel, F1 et IDF1 y sont calculés sur un jeu annoté séparé de l'entraînement.</Alerte>
            </Card>
            <Card titre="Utilisation">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Chiffre valeur={d.utilisation.analystes_actifs_30j} libelle="analystes actifs (30 jours)" />
                <Chiffre valeur={d.utilisation.rapports} libelle="rapports de scouting" detail={`${d.utilisation.rapports_valides} validés`} />
                <Chiffre valeur={d.utilisation.videos_indexees} libelle="vidéos indexées" />
              </div>
            </Card>
            <Card titre="Disponibilité"><Alerte ton="bleu">Disponibilité mensuelle et taux de synchronisation : {d.disponibilite.mesure}.</Alerte></Card>
          </div>
        ) : null}
      </Etat>
    </>
  );
}
