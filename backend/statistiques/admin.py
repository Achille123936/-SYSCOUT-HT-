from django.contrib import admin

from . import models


@admin.register(models.PonderationIndice)
class PonderationAdmin(admin.ModelAdmin):
    """Pondérations de l'indice de performance, propres à chaque groupe de postes (RG7)."""
    list_display = ['groupe', 'statistique', 'poids']
    list_filter = ['groupe']
