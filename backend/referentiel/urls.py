"""Routes du module referentiel (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('clubs', views.ClubViewSet, basename='club')
router.register('saisons', views.SaisonViewSet, basename='saison')
router.register('competitions', views.CompetitionViewSet, basename='competition')

urlpatterns = [
] + router.urls
