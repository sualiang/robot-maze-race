import { VenueStatus } from './enums';

/** 赛场 */
export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  status: VenueStatus;
  open_time: string;
  close_time: string;
  max_capacity: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVenueParams {
  name: string;
  address: string;
  city: string;
  district: string;
  latitude: number;
  longitude: number;
  open_time: string;
  close_time: string;
  max_capacity?: number;
  description?: string;
}

export interface UpdateVenueParams {
  name?: string;
  address?: string;
  status?: VenueStatus;
  open_time?: string;
  close_time?: string;
  max_capacity?: number;
  description?: string;
}
