from django.contrib import admin

from . import models

admin.site.register(models.Formule)
admin.site.register(models.Abonnement)
admin.site.register(models.Facture)
admin.site.register(models.Paiement)
