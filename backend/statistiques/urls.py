"""Routes du module statistiques (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('statistiques', views.StatistiqueViewSet, basename='statistique')

urlpatterns = [
] + router.urls
