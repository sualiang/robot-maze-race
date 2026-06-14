/**
 * 助力相关类型定义
 * types/help.ts
 */

/** 助力状态 */
export type HelpStatus = 'pending' | 'completed' | 'expired';

/** 助力记录 */
export interface IHelpRecord {
  id: string;
  helperId: string;
  helperNickname: string;
  helperAvatarUrl: string;
  status: HelpStatus;
  createdAt: string;
  completedAt?: string;
}

/** 我的助力活动 */
export interface IHelpActivity {
  id: string;
  targetRacePackageId: string;
  targetPackageName: string;
  requiredHelpCount: number; // 需要助力次数
  currentHelpCount: number; // 已获得助力次数
  status: 'active' | 'completed' | 'expired';
  helpers: IHelpRecord[];
  createdAt: string;
  expiresAt: string;
}

/** 分享卡片信息 */
export interface IShareInfo {
  title: string;
  imageUrl: string;
  path: string;
  inviterNickname: string;
}
