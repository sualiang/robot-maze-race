import { RefereeCertStatus } from './enums';

/** 裁判 */
export interface Referee {
  id: string;
  user_id: string;
  venue_id: string;
  cert_status: RefereeCertStatus;
  /** 审核状态: pending | approved | rejected */
  status?: string;
  /** 申请备注 */
  apply_remark?: string;
  /** 审核备注 */
  review_remark?: string;
  /** 审核时间 */
  reviewed_at?: string;
  /** 审核人 */
  reviewed_by?: string;
  /** 手机号 */
  phone?: string;
  /** 姓名 */
  name?: string;
  cert_image_url?: string;
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
}

/** 裁判自助申请请求 */
export interface RefereeApplyRequest {
  name: string;
  phone: string;
  remark?: string;
  operator_id?: string;
}

/** 裁判审核请求 */
export interface RefereeReviewRequest {
  action: 'approve' | 'reject';
  remark?: string;
}

/** 裁判申请状态响应 */
export interface RefereeApplicationStatus {
  has_application: boolean;
  application?: {
    id: string;
    name: string;
    phone: string;
    status: string;
    apply_remark: string;
    review_remark: string;
    reviewed_at: string | null;
    created_at: string;
  } | null;
}
