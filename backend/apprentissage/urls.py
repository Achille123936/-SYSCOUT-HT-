"""Routes du module apprentissage (montées sous /api/)."""
from django.urls import path

from . import views

urlpatterns = [
    path('ia/similaires/', views.similaires, name='ia-similaires'),
    path('ia/profils/', views.profils, name='ia-profils'),
    path('ia/xg/', views.modele_xg, name='ia-xg'),
]
