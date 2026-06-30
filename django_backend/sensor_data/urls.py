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
    path('survival/highscore', views.survival_highscore, name='survival-highscore'),
    path('survival/playground/run', views.survival_playground_run, name='survival-playground-run'),
    path('survival/greenhouse/telemetry', views.survival_greenhouse_telemetry, name='survival-greenhouse-telemetry'),
    # BioSim management proxy for the legacy /biosim dashboard (biosimApi.ts).
    path('biosim/status/', views.biosim_status, name='biosim-status'),
    path('biosim/state/', views.biosim_state, name='biosim-state'),
    path('biosim/tick/', views.biosim_tick, name='biosim-tick'),
    path('biosim/flow-rates/', views.biosim_flow_rates, name='biosim-flow-rates'),
    path('biosim/malfunctions/', views.biosim_malfunctions, name='biosim-malfunctions'),
    path('biosim/config/', views.biosim_config, name='biosim-config'),
    path('biosim/calibration/', views.biosim_calibration, name='biosim-calibration'),
    path('biosim/calibrate/', views.biosim_calibrate, name='biosim-calibrate'),
]
