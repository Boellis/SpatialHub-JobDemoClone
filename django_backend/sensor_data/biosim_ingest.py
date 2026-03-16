"""
biosim_ingest.py — Pure translation function: BioSim modules dict -> list[EnrichedSensorData]

Converts a single BioSim WebSocket tick payload's `modules` dict into a list of
EnrichedSensorData model instances ready for bulk_create(). No .save() calls are
made; the caller (Phase 9 Django bridge management command) is responsible for
calling EnrichedSensorData.objects.bulk_create(rows).

Unit conversion table:
  gb-temp        : Crew_Quarters_Environment.temperature         -> direct °C
  gb-humidity    : Crew_Quarters_Environment.relativeHumidity    -> direct %
  gb-co2         : Co2GasConcentrationSensor.value * 1e6         -> ppm
  ac-o2          : O22GasConcentrationSensor.value * 100         -> %
  ac-pressure    : Crew_Quarters_Environment.totalPressure       -> direct kPa
  ac-filtration  : VCCR Air out / VCCR Air in * 100             -> % efficiency
  wr-flow        : Crew PotableWater actualFlowRates[0] * 60     -> L/min
  wr-ph          : Grey_Water_Store level/capacity * 1.5 + 6.0  -> pH proxy
  wr-tds         : Dirty_Water_Store level/capacity * 10000      -> ppm TDS proxy
  pt-power       : Nuclear_Source Power actualFlowRates[0] / 30 -> kW
  pt-battery     : General_Power_Store level/capacity * 100      -> % charge
  pt-coolant     : Crew_Quarters_Environment.temperature + 1.0   -> °C proxy
"""

from django.utils import timezone

from .models import EnrichedSensorData


HUB_ID = 'biosim-habitat-01'
LOCATION = 'Mars Habitat Alpha'
OWNER = 'NASA BioSim'
WORKERS = 'Crew Quarters Group'


def _row(sensor_id, sensor_name, value, zone_id, tick_time):
    """Construct an unsaved EnrichedSensorData instance."""
    return EnrichedSensorData(
        hub_id=HUB_ID,
        sensor_name=sensor_name,
        sensor_id=sensor_id,
        device_addr=zone_id,
        sensor_val=value,
        datetime=tick_time,
        location=LOCATION,
        owner=OWNER,
        workers=WORKERS,
    )


def biosim_tick_to_rows(modules: dict, tick_time=None) -> list:
    """
    Translate a BioSim tick's modules dict into EnrichedSensorData instances.

    Args:
        modules: The 'modules' dict from a BioSim simulation state response.
        tick_time: datetime for the rows. Defaults to timezone.now() if None.

    Returns:
        List of unsaved EnrichedSensorData instances ready for bulk_create().
        If a module is missing from the dict, the corresponding sensor(s) are
        omitted entirely — no zero-fills.
    """
    if tick_time is None:
        tick_time = timezone.now()

    rows = []

    # --- GROW BAYS ---
    env = modules.get('Crew_Quarters_Environment', {})
    env_props = env.get('properties', {})

    # gb-temp: direct °C
    gb_temp = env_props.get('temperature')
    if gb_temp is not None:
        rows.append(_row('gb-temp', 'temperature', gb_temp, 'grow-bays', tick_time))

    # gb-humidity: direct %
    gb_humidity = env_props.get('relativeHumidity')
    if gb_humidity is not None:
        rows.append(_row('gb-humidity', 'humidity', gb_humidity, 'grow-bays', tick_time))

    # gb-co2: mol fraction * 1e6 = ppm (0.00073 -> 730 ppm)
    co2_sensor = modules.get('Co2GasConcentrationSensor', {})
    co2_val = co2_sensor.get('properties', {}).get('value')
    if co2_val is not None:
        rows.append(_row('gb-co2', 'co2', co2_val * 1_000_000, 'grow-bays', tick_time))

    # --- ATMOSPHERE CONTROL ---

    # ac-o2: mol fraction * 100 = % (0.20807 -> 20.81%)
    o2_sensor = modules.get('O22GasConcentrationSensor', {})
    o2_val = o2_sensor.get('properties', {}).get('value')
    if o2_val is not None:
        rows.append(_row('ac-o2', 'o2', o2_val * 100, 'atmosphere-control', tick_time))

    # ac-pressure: direct kPa
    ac_pressure = env_props.get('totalPressure')
    if ac_pressure is not None:
        rows.append(_row('ac-pressure', 'pressure', ac_pressure, 'atmosphere-control', tick_time))

    # ac-filtration: VCCR air output / air input * 100 = % efficiency
    vccr = modules.get('VCCR', {})
    air_consumer = next(
        (c for c in vccr.get('consumers', []) if c.get('type') == 'Air'), None
    )
    air_producer = next(
        (p for p in vccr.get('producers', []) if p.get('type') == 'Air'), None
    )
    if air_consumer and air_producer:
        in_flow = air_consumer.get('rates', {}).get('actualFlowRates', [None])[0]
        out_flow = air_producer.get('rates', {}).get('actualFlowRates', [None])[0]
        if in_flow is not None and out_flow is not None and in_flow > 0:
            filtration = (out_flow / in_flow) * 100
            rows.append(_row('ac-filtration', 'filtration', filtration, 'atmosphere-control', tick_time))

    # --- WATER RECYCLING ---

    # wr-flow: Crew potable water L/tick * 60 = L/min
    crew = modules.get('Crew_Quarters_Group', {})
    potable = next(
        (c for c in crew.get('consumers', []) if c.get('type') == 'PotableWater'), None
    )
    if potable is not None:
        flow_rate = potable.get('rates', {}).get('actualFlowRates', [None])[0]
        if flow_rate is not None:
            rows.append(_row('wr-flow', 'flow', flow_rate * 60, 'water-recycling', tick_time))

    # wr-ph: grey water fill ratio -> pH proxy: (level/capacity * 1.5) + 6.0
    grey = modules.get('Grey_Water_Store', {})
    grey_props = grey.get('properties', {})
    grey_level = grey_props.get('currentLevel')
    grey_capacity = grey_props.get('currentCapacity')
    if grey_level is not None and grey_capacity is not None and grey_capacity > 0:
        wr_ph = (grey_level / grey_capacity) * 1.5 + 6.0
        rows.append(_row('wr-ph', 'ph', wr_ph, 'water-recycling', tick_time))

    # wr-tds: dirty water fill ratio * 10000 = ppm TDS proxy
    dirty = modules.get('Dirty_Water_Store', {})
    dirty_props = dirty.get('properties', {})
    dirty_level = dirty_props.get('currentLevel')
    dirty_capacity = dirty_props.get('currentCapacity')
    if dirty_level is not None and dirty_capacity is not None and dirty_capacity > 0:
        wr_tds = (dirty_level / dirty_capacity) * 10000
        rows.append(_row('wr-tds', 'tds', wr_tds, 'water-recycling', tick_time))

    # --- POWER & THERMAL ---

    # pt-power: Nuclear_Source power flow / 30 -> kW (3000 W = 100 kW nominal)
    nuclear = modules.get('Nuclear_Source', {})
    power_producer = next(
        (p for p in nuclear.get('producers', []) if p.get('type') == 'Power'), None
    )
    if power_producer is not None:
        power_flow = power_producer.get('rates', {}).get('actualFlowRates', [None])[0]
        if power_flow is not None:
            rows.append(_row('pt-power', 'power', power_flow / 30, 'power-thermal', tick_time))

    # pt-battery: General_Power_Store level / capacity * 100 = % charge
    power_store = modules.get('General_Power_Store', {})
    ps_props = power_store.get('properties', {})
    ps_level = ps_props.get('currentLevel')
    ps_capacity = ps_props.get('currentCapacity')
    if ps_level is not None and ps_capacity is not None and ps_capacity > 0:
        rows.append(_row('pt-battery', 'battery', (ps_level / ps_capacity) * 100, 'power-thermal', tick_time))

    # pt-coolant: crew quarters temperature + 1.0°C coolant offset proxy
    pt_temp = env_props.get('temperature')
    if pt_temp is not None:
        rows.append(_row('pt-coolant', 'coolant', pt_temp + 1.0, 'power-thermal', tick_time))

    return rows
