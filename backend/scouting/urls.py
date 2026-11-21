"""Routes du module scouting (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('rapports', views.RapportViewSet, basename='rapport')
router.register('shortlists', views.ShortlistViewSet, basename='shortlist')

urlpatterns = [
] + router.urls
