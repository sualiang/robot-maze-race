/**
 * 参赛包类型定义
 * types/package.ts
 */

/** 参赛包 */
export interface IRacePackage {
  id: string;
  name: string;
  description: string;
  originalPrice: number; // 原价（分）
  salePrice: number; // 售价（分）
  raceCount: number; // 包含参赛次数
  validDays: number; // 有效天数
  isHot: boolean;
  isLimited: boolean;
  sortOrder: number;
  createdAt: string;
}

/** 参赛包购买记录 */
export interface IPackageOrder {
  id: string;
  packageId: string;
  packageName: string;
  amount: number; // 实付金额（分）
  raceCount: number;
  remainCount: number; // 剩余次数
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  createdAt: string;
  paidAt?: string;
}
