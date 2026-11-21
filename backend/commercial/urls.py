"""Routes du module commercial (montées sous /api/)."""
from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('formules', views.FormuleViewSet, basename='formule')
router.register('abonnements', views.AbonnementViewSet, basename='abonnement')
router.register('factures', views.FactureViewSet, basename='facture')
router.register('paiements', views.PaiementViewSet, basename='paiement')

urlpatterns = [
    path('formules-publiques/', views.formules_publiques, name='formules-publiques'),
    path('chiffres-publics/', views.chiffres_publics, name='chiffres-publics'),
] + router.urls
