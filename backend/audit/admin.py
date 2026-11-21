from django.contrib import admin

from . import models


@admin.register(models.OperationAudit)
class AuditAdmin(admin.ModelAdmin):
    """Le journal se consulte mais ne se modifie pas."""
    list_display = ['date_heure', 'utilisateur', 'action', 'table_concernee', 'id_enregistrement', 'adresse_ip']
    list_filter = ['action', 'table_concernee']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
