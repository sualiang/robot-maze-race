import { RefereeCertStatus } from './enums';

/** 裁判 */
export interface Referee {
  id: string;
  user_id: string;
  venue_id: string;
  cert_status: RefereeCertStatus;
  cert_image_url?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  last_active_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRefereeParams {
  user_id: string;
  venue_id: string;
  cert_image_url?: string;
}

export interface UpdateRefereeParams {
  venue_id?: string;
  cert_status?: RefereeCertStatus;
  gps_latitude?: number;
  gps_longitude?: number;
}
