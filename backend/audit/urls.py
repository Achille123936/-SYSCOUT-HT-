"""Routes du module audit (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('audit', views.AuditViewSet, basename='audit')

urlpatterns = [
    path('sauvegarde/', views.sauvegarde, name='sauvegarde'),
] + router.urls
