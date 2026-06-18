/**
 * 签到 & 排队类型定义
 * types/checkin.ts
 */

/** 签到状态 */
export type CheckinStatus = 'idle' | 'checking' | 'checked' | 'queuing' | 'racing' | 'finished';

/** 赛场信息 */
export interface IArena {
  id: string;
  name: string;
  location: string;
  status: 'open' | 'closed' | 'maintenance';
  currentQueueSize: number;
  estimatedWaitTime: number; // 预估等待时间（秒）
}

/** 签到记录 */
export interface ICheckinRecord {
  id: string;
  arenaId: string;
  arenaName: string;
  status: CheckinStatus;
  queueNumber: number;
  checkinTime: string;
  raceTime?: string;
  finishTime?: string;
}

/** 排队信息 */
export interface IQueueInfo {
  queueId: string;
  queueNumber: number;
  position: number; // 当前排在第几位
  estimatedWaitTime: number; // 预估等待时间（秒）
  status: CheckinStatus;
}
