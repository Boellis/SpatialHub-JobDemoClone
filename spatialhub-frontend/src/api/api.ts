import axios from 'axios';
import type { SensorData } from '../types/index';
import type { HabitatZone } from '../types/habitat';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function fetchRawSensorData(_page = 1): Promise<SensorData[]> {
    const response = await axios.get(`${BASE_URL}/raw/`);
    return response.data;
}

export const fetchEnrichedSensorData = async (page: number) =>
  axios.get(`${BASE_URL}/enriched/?page=${page}`).then(res => res.data);

export const provisionHub = async (payload: {
  location: string;
  owner: string;
  workers: string[];
}) =>
  axios.post(`${BASE_URL}/provision/`, payload).then(res => res.data);

export const fetchHabitatZones = async (): Promise<HabitatZone[]> =>
  axios.get(`${BASE_URL}/habitat/zones/`).then(res => res.data);

export const fetchHubList = async (): Promise<{ hub_id: string }[]> =>
  axios.get(`${BASE_URL}/hub/`).then(res => res.data);

export const sendCommand = async (payload: { hub_id: string; command: string }) =>
  axios.post(`${BASE_URL}/send-command/`, payload).then(res => res.data);
