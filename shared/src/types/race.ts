import { RaceResultStatus } from './enums';

/** 签到记录 */
export interface Checkin {
  id: string;
  user_id: string;
  venue_id: string;
  package_id: string;
  checkin_at: string;
  race_count_used: number;
  created_at: string;
}

export interface CreateCheckinParams {
  user_id: string;
  venue_id: string;
  package_id: string;
  race_count_used: number;
}

/** 比赛成绩 */
export interface RaceResult {
  id: string;
  venue_id: string;
  user_id: string;
  checkin_id: string;
  score: number;
  finish_time_ms: number;
  rank: number;
  status: RaceResultStatus;
  started_at: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRaceResultParams {
  venue_id: string;
  user_id: string;
  checkin_id: string;
}

export interface UpdateRaceResultParams {
  score?: number;
  finish_time_ms?: number;
  rank?: number;
  status?: RaceResultStatus;
  finished_at?: string;
}
