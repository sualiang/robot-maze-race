/** 考勤记录 */
export interface Attendance {
  id: string;
  referee_id: string;
  venue_id: string;
  check_in_at: string;
  check_out_at?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAttendanceParams {
  referee_id: string;
  venue_id: string;
  gps_latitude?: number;
  gps_longitude?: number;
}

/** 支付流水 */
export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  channel: string;
  transaction_no: string;
  status: string;
  raw_response?: Record<string, unknown>;
  paid_at?: string;
  refunded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentParams {
  order_id: string;
  amount: number;
  channel: string;
  transaction_no: string;
  raw_response?: Record<string, unknown>;
}
