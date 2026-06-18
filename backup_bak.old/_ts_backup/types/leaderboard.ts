/**
 * 榜单类型定义
 * types/leaderboard.ts
 */

/** 榜单类型 */
export type LeaderboardType = 'daily' | 'monthly' | 'yearly';

/** 榜单条目 */
export interface ILeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string;
  score: number; // 最短用时（秒）
  raceCount: number;
  recordDate: string;
}

/** 我的排名信息 */
export interface IMyRanking {
  rank: number;
  score: number;
  raceCount: number;
  totalPlayers: number;
  percentile: number; // 击败百分比 0-100
}

/** 榜单页面数据 */
export interface ILeaderboardData {
  type: LeaderboardType;
  entries: ILeaderboardEntry[];
  myRanking: IMyRanking | null;
}
