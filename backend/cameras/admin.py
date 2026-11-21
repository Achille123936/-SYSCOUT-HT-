from django.contrib import admin

from . import models


@admin.register(models.Camera)
class CameraAdmin(admin.ModelAdmin):
    list_display = ['nom', 'stade', 'protocole', 'etat', 'latence_ms', 'derniere_verification', 'active']
    list_filter = ['etat', 'protocole', 'active']


@admin.register(models.EnregistrementVideo)
class EnregistrementVideoAdmin(admin.ModelAdmin):
    list_display = ['match', 'camera', 'debut', 'fin']
