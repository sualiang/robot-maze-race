import { HelpStatus } from './enums';

/** 助力记录 */
export interface Help {
  id: string;
  initiator_id: string;
  helper_id: string;
  status: HelpStatus;
  coupon_amount?: number;
  helped_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateHelpParams {
  initiator_id: string;
  helper_id: string;
}
