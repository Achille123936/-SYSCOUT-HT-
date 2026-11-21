"""Routes du module caméras (montées sous /api/)."""
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register('cameras', views.CameraViewSet, basename='camera')
router.register('enregistrements', views.EnregistrementVideoViewSet, basename='enregistrement')

urlpatterns = router.urls
