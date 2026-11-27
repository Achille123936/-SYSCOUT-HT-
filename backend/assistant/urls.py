"""Routes de l'assistant football (montées sous /api/)."""
from django.urls import path

from . import views

urlpatterns = [
    # /api/assistant/ reste l'assistant à règles de l'app « equipe » ; celui-ci est l'assistant à modèle de langage
    path('assistant/ia/', views.poser_question, name='assistant-ia'),
]
