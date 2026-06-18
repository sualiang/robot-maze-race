// 玩家端 - 本地存储封装

export function setSync(key: string, value: unknown): void {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.error('storage set error', e);
  }
}

export function getSync<T = unknown>(key: string): T | null {
  try {
    return wx.getStorageSync(key) as T;
  } catch {
    return null;
  }
}

export function removeSync(key: string): void {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    console.error('storage remove error', e);
  }
}

export const STORAGE_KEYS = {
  TOKEN: 'player_token',
  USER: 'player_user',
  OFFLINE_CHECKIN: 'offline_checkin',
} as const;
