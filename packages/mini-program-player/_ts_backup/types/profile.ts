/**
 * 个人中心类型定义
 * types/profile.ts
 */

/** 参赛记录 */
export interface IRaceRecord {
  id: string;
  arenaId: string;
  arenaName: string;
  score: number; // 用时（秒）
  rank?: number;
  mazeDifficulty: number;
  createdAt: string;
}

/** 优惠券 */
export interface ICoupon {
  id: string;
  name: string;
  type: 'discount' | 'cash';
  value: number; // 折扣百分比或现金金额（分）
  minAmount: number; // 最低消费金额（分）
  validFrom: string;
  validTo: string;
  usedAt?: string;
  status: 'available' | 'used' | 'expired';
}

/** 个人信息编辑表单 */
export interface IProfileFormData {
  nickname: string;
  avatarUrl: string;
  phone?: string;
  gender?: number;
}
