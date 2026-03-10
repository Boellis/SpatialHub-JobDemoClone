from django.core.management.base import BaseCommand
from sensor_data.models import HabitatZone


ZONES = [
    {
        "zone_id": "grow-bays",
        "name": "Grow Bays",
        "description": "Hydroponic growing chambers for food crops. Maintains precise CO2, temperature, and humidity for optimal plant growth in the Martian habitat.",
        "sensors": [
            {"sensor_id": "gb-co2", "name": "CO2 Level", "unit": "ppm", "type": "co2"},
            {"sensor_id": "gb-temp", "name": "Temperature", "unit": "°C", "type": "temperature"},
            {"sensor_id": "gb-humidity", "name": "Humidity", "unit": "%RH", "type": "humidity"},
        ],
        "thresholds": {
            "gb-co2": {
                "green": [800, 1200],
                "yellow": [600, 1800],
                "red": [400, 2500],
            },
            "gb-temp": {
                "green": [20, 26],
                "yellow": [16, 30],
                "red": [10, 35],
            },
            "gb-humidity": {
                "green": [60, 75],
                "yellow": [50, 85],
                "red": [30, 95],
            },
        },
        "position": {"x": -6, "y": 0, "z": 0},
    },
    {
        "zone_id": "atmosphere-control",
        "name": "Atmosphere Control",
        "description": "Life support systems managing breathable air mixture, cabin pressure, and HEPA filtration for the entire habitat module.",
        "sensors": [
            {"sensor_id": "ac-o2", "name": "O2 Level", "unit": "%", "type": "o2"},
            {"sensor_id": "ac-pressure", "name": "Pressure", "unit": "kPa", "type": "pressure"},
            {"sensor_id": "ac-filtration", "name": "Air Filtration Rate", "unit": "L/min", "type": "filtration"},
        ],
        "thresholds": {
            "ac-o2": {
                "green": [19.5, 23.0],
                "yellow": [17.0, 25.0],
                "red": [14.0, 30.0],
            },
            "ac-pressure": {
                "green": [97, 103],
                "yellow": [90, 110],
                "red": [80, 120],
            },
            "ac-filtration": {
                "green": [450, 550],
                "yellow": [350, 650],
                "red": [200, 800],
            },
        },
        "position": {"x": 0, "y": 0, "z": -6},
    },
    {
        "zone_id": "water-recycling",
        "name": "Water Recycling",
        "description": "Closed-loop water reclamation system processing grey water and condensate into potable water for crew and plant growth.",
        "sensors": [
            {"sensor_id": "wr-ph", "name": "pH Level", "unit": "pH", "type": "ph"},
            {"sensor_id": "wr-flow", "name": "Water Flow Rate", "unit": "L/hr", "type": "flow"},
            {"sensor_id": "wr-tds", "name": "TDS", "unit": "ppm", "type": "tds"},
        ],
        "thresholds": {
            "wr-ph": {
                "green": [6.5, 7.5],
                "yellow": [6.0, 8.0],
                "red": [5.0, 9.5],
            },
            "wr-flow": {
                "green": [18, 22],
                "yellow": [14, 28],
                "red": [8, 40],
            },
            "wr-tds": {
                "green": [50, 200],
                "yellow": [20, 400],
                "red": [0, 700],
            },
        },
        "position": {"x": 6, "y": 0, "z": 0},
    },
    {
        "zone_id": "power-thermal",
        "name": "Power / Thermal",
        "description": "Nuclear RTG power generation, battery storage, and active thermal management for the habitat's electrical and thermal systems.",
        "sensors": [
            {"sensor_id": "pt-power", "name": "Power Output", "unit": "kW", "type": "power"},
            {"sensor_id": "pt-coolant", "name": "Coolant Temperature", "unit": "°C", "type": "temperature"},
            {"sensor_id": "pt-battery", "name": "Battery Charge", "unit": "%", "type": "battery"},
        ],
        "thresholds": {
            "pt-power": {
                "green": [8, 12],
                "yellow": [5, 15],
                "red": [2, 20],
            },
            "pt-coolant": {
                "green": [35, 55],
                "yellow": [25, 70],
                "red": [10, 90],
            },
            "pt-battery": {
                "green": [40, 100],
                "yellow": [20, 100],
                "red": [5, 100],
            },
        },
        "position": {"x": 0, "y": 0, "z": 6},
    },
]


class Command(BaseCommand):
    help = "Seed the habitat_zone table with 4 Mars habitat zone configurations"

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for zone_data in ZONES:
            obj, created = HabitatZone.objects.update_or_create(
                zone_id=zone_data["zone_id"],
                defaults={
                    "name": zone_data["name"],
                    "description": zone_data["description"],
                    "sensors": zone_data["sensors"],
                    "thresholds": zone_data["thresholds"],
                    "position": zone_data["position"],
                },
            )
            if created:
                created_count += 1
                self.stdout.write(f"  Created: {obj}")
            else:
                updated_count += 1
                self.stdout.write(f"  Updated: {obj}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. {created_count} created, {updated_count} updated."
            )
        )
