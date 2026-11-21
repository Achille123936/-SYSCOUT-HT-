"""Audit : journal des opérations et sauvegarde (CU16) — sérialiseurs et contrôles de saisie."""
from rest_framework import serializers

from audit.models import OperationAudit


class AuditSerializer(serializers.ModelSerializer):
    utilisateur_nom = serializers.CharField(source='utilisateur.nom_utilisateur', read_only=True, default=None)
    action_libelle = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = OperationAudit
        fields = ['id', 'date_heure', 'utilisateur', 'utilisateur_nom', 'action', 'action_libelle',
                  'table_concernee', 'id_enregistrement', 'valeur_avant', 'valeur_apres', 'adresse_ip']
