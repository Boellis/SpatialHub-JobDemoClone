from django.urls import path
from .views import (
    RawSensorListView,
    EnrichedSensorListView,
    HubListView,
    HubProvisionView,
    SendHubCommand,
    HabitatZoneListView,
)

urlpatterns = [
    path('raw/', RawSensorListView.as_view(), name='raw-sensor-list'),
    path('enriched/', EnrichedSensorListView.as_view(), name='enriched-sensor-list'),
    path('hub/', HubListView.as_view(), name='hub-list'),
    path('provision/', HubProvisionView.as_view(), name='hub-provision'),
    path('send-command/', SendHubCommand.as_view(), name='send-command'),
    path('habitat/zones/', HabitatZoneListView.as_view(), name='habitat-zone-list'),
]
