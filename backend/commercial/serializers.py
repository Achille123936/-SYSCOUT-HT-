"""Commercial : formules, abonnements, factures et paiements (CU13, CU14) — sérialiseurs et contrôles de saisie."""
from django.db import transaction
from rest_framework import serializers

from commercial.models import Abonnement, Facture, Formule, Paiement
from core.services import ajouter_mois, generer_facture


class FormuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Formule
        fields = ['id', 'nom', 'prix_mensuel_htg', 'nombre_comptes', 'divisions_incluses', 'rapports_inclus']


class PaiementSerializer(serializers.ModelSerializer):
    mode_libelle = serializers.CharField(source='get_mode_display', read_only=True)
    encaisse_par_nom = serializers.CharField(source='encaisse_par.nom_complet', read_only=True)
    numero_facture = serializers.CharField(source='facture.numero_facture', read_only=True)

    class Meta:
        model = Paiement
        fields = ['id', 'facture', 'numero_facture', 'date_paiement', 'montant_htg', 'mode', 'mode_libelle',
                  'reference', 'encaisse_par', 'encaisse_par_nom', 'annule', 'motif_annulation']
        read_only_fields = ['date_paiement', 'encaisse_par', 'annule', 'motif_annulation']

    def validate(self, data):
        facture = data['facture']
        if facture.statut == 'ANNULEE':
            raise serializers.ValidationError('Cette facture est annulée.')
        # CU14 étape 4 : le montant ne dépasse pas le solde
        if data['montant_htg'] > facture.solde_du:
            raise serializers.ValidationError(
                {'montant_htg': f'Le montant dépasse le solde dû ({facture.solde_du} HTG).'})
        return data


class FactureSerializer(serializers.ModelSerializer):
    club_nom = serializers.CharField(source='abonnement.club.nom', read_only=True)
    formule_nom = serializers.CharField(source='abonnement.formule.nom', read_only=True)
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)
    paiements = PaiementSerializer(many=True, read_only=True)

    class Meta:
        model = Facture
        fields = ['id', 'numero_facture', 'abonnement', 'club_nom', 'formule_nom', 'date_emission', 'date_echeance',
                  'periode_debut', 'periode_fin', 'montant_ht', 'taxe', 'montant_ttc', 'solde_du', 'statut',
                  'statut_libelle', 'motif_annulation', 'paiements']


class AbonnementSerializer(serializers.ModelSerializer):
    club_nom = serializers.CharField(source='club.nom', read_only=True)
    formule_nom = serializers.CharField(source='formule.nom', read_only=True)
    etat_libelle = serializers.CharField(source='get_etat_display', read_only=True)
    factures = FactureSerializer(many=True, read_only=True)

    class Meta:
        model = Abonnement
        fields = ['id', 'club', 'club_nom', 'formule', 'formule_nom', 'date_debut', 'date_echeance', 'duree_mois',
                  'montant_htg', 'etat', 'etat_libelle', 'factures']
        read_only_fields = ['date_echeance', 'montant_htg', 'etat']

    @transaction.atomic
    def create(self, data):
        # CU13 étape 4 : le système calcule le montant et la date d'échéance
        duree = data.get('duree_mois', 12)
        data['montant_htg'] = data['formule'].prix_mensuel_htg * duree
        data['date_echeance'] = ajouter_mois(data['date_debut'], duree)
        abonnement = super().create(data)
        generer_facture(abonnement, abonnement.date_debut)
        return abonnement
