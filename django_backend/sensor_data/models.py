from django.db import models
import string, random

def generate_hub_id():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=20))

class RawSensorData(models.Model):
    hub_id = models.TextField()
    sensor_name = models.TextField()
    device_addr = models.TextField()
    sensor_val = models.FloatField()
    datetime = models.DateTimeField()
    sensor_id = models.TextField()

    class Meta:
        db_table = 'raw_sensor_data'  # Tell Django to use the existing table

class HubConfig(models.Model):
    hub_id = models.CharField(max_length=20, unique=True, default=generate_hub_id, editable=False)
    owner = models.JSONField(default=list)
    workers = models.JSONField(default=list)
    location = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'hub_config'  # Tell Django to use the existing table
    
    def __str__(self):
        return f"{self.hub_id} - {self.location}"
    

class EnrichedSensorData(models.Model):
    hub_id = models.CharField(max_length=100)
    sensor_name = models.CharField(max_length=100)
    device_addr = models.CharField(max_length=100)
    sensor_val = models.FloatField()
    datetime = models.DateTimeField()
    sensor_id = models.CharField(max_length=100)
    location = models.CharField(max_length=100)
    owner = models.CharField(max_length=100)
    workers = models.CharField(max_length=100)

    class Meta:
        db_table = 'enriched_sensor_data'  # Tell Django to use the existing DB table


class HabitatZone(models.Model):
    zone_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    sensors = models.JSONField(default=list)
    thresholds = models.JSONField(default=dict)
    position = models.JSONField(default=dict)

    class Meta:
        db_table = 'habitat_zone'

    def __str__(self):
        return f"{self.zone_id} - {self.name}"