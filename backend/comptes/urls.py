"""Routes du module comptes (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('utilisateurs', views.UtilisateurViewSet, basename='utilisateur')

urlpatterns = [
    path('auth/connexion/', views.connexion, name='connexion'),
    path('auth/deconnexion/', views.deconnexion, name='deconnexion'),
    path('auth/inscription/', views.inscription, name='inscription'),
    path('auth/moi/', views.moi, name='moi'),
    path('auth/mot-de-passe/', views.changer_mot_de_passe, name='changer-mot-de-passe'),
] + router.urls
