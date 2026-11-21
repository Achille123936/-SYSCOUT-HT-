from django.contrib import admin

from . import models

admin.site.register(models.Match)


@admin.register(models.PropositionIA)
class PropositionIAAdmin(admin.ModelAdmin):
    list_display = ['id', 'match', 'minute', 'type_action', 'joueur', 'confiance', 'statut', 'modele']
    list_filter = ['statut', 'type_action']


@admin.register(models.ValidationEvenement)
class ValidationEvenementAdmin(admin.ModelAdmin):
    """Historique des décisions : consultable, jamais modifiable."""
    list_display = ['date', 'match', 'validateur', 'statut_avant', 'statut_apres', 'commentaire']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(models.PisteJoueur)
class PisteJoueurAdmin(admin.ModelAdmin):
    list_display = ['match', 'piste', 'joueur', 'temps_video', 'x', 'y', 'confiance']
    list_filter = ['match']
