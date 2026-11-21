from django.contrib import admin

from . import models

admin.site.register(models.Club)
admin.site.register(models.Saison)
admin.site.register(models.Competition)
