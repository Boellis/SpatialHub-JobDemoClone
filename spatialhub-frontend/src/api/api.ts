import axios from 'axios';
import type { SensorData } from '../types/index';
import type { HabitatZone } from '../types/habitat';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://spatialhub-backend-823061962201.us-central1.run.app/api';

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
