"""Routes du module equipe (montées sous /api/)."""
from django.urls import path

from . import views

urlpatterns = [
    path('equipes/', views.equipes, name='equipes'),
    path('equipes/<int:club_id>/', views.equipe, name='equipe'),
    path('assistant/', views.assistant, name='assistant'),
]
