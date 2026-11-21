"""Routes du module matchs (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('matchs', views.MatchViewSet, basename='match')
router.register('evenements', views.EvenementViewSet, basename='evenement')
router.register('propositions-ia', views.PropositionIAViewSet, basename='proposition-ia')
router.register('pistes-ia', views.PisteJoueurViewSet, basename='piste-ia')
router.register('annotations', views.AnnotationViewSet, basename='annotation')
router.register('playlists', views.PlaylistViewSet, basename='playlist')

urlpatterns = [
] + router.urls
