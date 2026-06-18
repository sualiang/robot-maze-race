// ==================== 枚举常量 ====================

/** 用户角色 */
export enum UserRole {
  PLAYER = 'player',
  REFEREE = 'referee',
  OPERATOR = 'operator',
  ADMIN = 'admin',
}

/** 赛场状态 */
export enum VenueStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  MAINTENANCE = 'maintenance',
}

/** 裁判认证状态 */
export enum RefereeCertStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** 订单支付状态 */
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  REFUNDING = 'refunding',
  REFUNDED = 'refunded',
}

/** 支付方式 */
export enum PaymentMethod {
  WECHAT_PAY = 'wechat_pay',
  ALIPAY = 'alipay',
  BALANCE = 'balance',
}

/** 比赛成绩状态 */
export enum RaceResultStatus {
  RACING = 'racing',
  FINISHED = 'finished',
  TIMEOUT = 'timeout',
  FAULT = 'fault',
}

/** 助力状态 */
export enum HelpStatus {
  INITIATED = 'initiated',
  HELPED = 'helped',
  EXPIRED = 'expired',
}

/** 支付流水状态 */
export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

// ==================== 通用类型 ====================

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface Timestamps {
  created_at: string;
  updated_at: string;
}
