from django.contrib import admin

from . import models


@admin.register(models.ModeleXG)
class ModeleXGAdmin(admin.ModelAdmin):
    list_display = ['date_entrainement', 'nb_tirs', 'nb_buts', 'perte', 'perte_reference', 'actif']
