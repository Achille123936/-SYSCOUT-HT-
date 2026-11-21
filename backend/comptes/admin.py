from django.contrib import admin

from . import models


@admin.register(models.Utilisateur)
class UtilisateurAdmin(admin.ModelAdmin):
    list_display = ['nom_utilisateur', 'nom', 'prenom', 'role', 'is_active', 'bloque', 'last_login']
    list_filter = ['role', 'is_active', 'bloque']
    search_fields = ['nom_utilisateur', 'nom', 'prenom']
    exclude = ['password']
