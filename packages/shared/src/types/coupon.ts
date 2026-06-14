import { CouponStatus } from './enums';

/** 膨胀券 */
export interface ExpandCoupon {
  id: string;
  user_id: string;
  help_id: string;
  amount: number;
  status: CouponStatus;
  valid_from: string;
  valid_until: string;
  used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExpandCouponParams {
  user_id: string;
  help_id: string;
  amount: number;
  valid_days?: number;
}
