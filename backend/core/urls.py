"""Routes transversales : tableau de bord et export PDF."""
from django.urls import path

from . import views

urlpatterns = [
    path('tableau-de-bord/', views.tableau_de_bord, name='tableau-de-bord'),
    path('indicateurs/', views.indicateurs, name='indicateurs'),
    path('exports/', views.exporter, name='exporter'),
    path('exports/telecharger/', views.telecharger, name='telecharger'),
]
