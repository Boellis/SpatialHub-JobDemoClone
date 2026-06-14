from django.urls import path
from . import views
from .views import (
    RawSensorListView,
    EnrichedSensorListView,
    HubListView,
    HubProvisionView,
    SendHubCommand,
    HabitatZoneListView,
    SensorIngestView,
)

urlpatterns = [
    path('raw/', RawSensorListView.as_view(), name='raw-sensor-list'),
    path('enriched/', EnrichedSensorListView.as_view(), name='enriched-sensor-list'),
    path('hub/', HubListView.as_view(), name='hub-list'),
    path('provision/', HubProvisionView.as_view(), name='hub-provision'),
    path('send-command/', SendHubCommand.as_view(), name='send-command'),
    path('habitat/zones/', HabitatZoneListView.as_view(), name='habitat-zone-list'),
    path('sensor-ingest/', SensorIngestView.as_view(), name='sensor-ingest'),
    path('survival/stream', views.survival_stream, name='survival-stream'),
    path('survival/stop', views.survival_stop, name='survival-stop'),
    path('survival/ingest', views.survival_ingest, name='survival-ingest'),
    path('survival/live', views.survival_live, name='survival-live'),
    path('survival/control', views.survival_control, name='survival-control'),
    path('survival/command', views.survival_command, name='survival-command'),
    path('survival/history', views.survival_history, name='survival-history'),
    path('survival/history/<str:run_id>', views.survival_run_detail, name='survival-run-detail'),
    path('survival/plans', views.survival_plans, name='survival-plans'),
]
