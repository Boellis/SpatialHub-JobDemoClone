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


class SurvivalRun(models.Model):
    """One BioSim survival run, persisted so its decision log survives restarts.

    Written best-effort from ``survival.history`` as ``run``/``end`` events flow
    through the relay. ``run_id`` matches the id the pilot stamps on the live stream.
    """
    run_id = models.CharField(max_length=64, unique=True, db_index=True)
    difficulty = models.CharField(max_length=32, default='off')
    crew_size = models.IntegerField(default=15)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    sols_survived = models.IntegerField(default=0)
    ended_reason = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        db_table = 'survival_run'
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.run_id} ({self.sols_survived} sols)"


class SurvivalDecision(models.Model):
    """A single reasoned decision (one sol) within a run — the durable decision log."""
    run = models.ForeignKey(SurvivalRun, related_name='decisions', on_delete=models.CASCADE)
    sol = models.IntegerField(default=0)
    reasoning = models.TextField()
    actions = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'survival_decision'
        ordering = ['sol', 'id']
        indexes = [models.Index(fields=['run', 'sol'])]


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