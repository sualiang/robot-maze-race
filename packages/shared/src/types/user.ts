import { UserRole } from './enums';

/** 微信小程序登录请求 */
export interface WxLoginRequest {
  code: string;
  encrypted_data?: string;
  iv?: string;
}

/** 微信登录响应 */
export interface WxLoginResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

/** 用户 */
export interface User {
  id: string;
  openid: string;
  unionid?: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  role: UserRole;
  race_count: number;
  created_at: string;
  updated_at: string;
}

/** 创建/更新用户参数 */
export interface CreateUserParams {
  openid: string;
  unionid?: string;
  nickname: string;
  avatar_url?: string;
  phone?: string;
  role?: UserRole;
}

export interface UpdateUserParams {
  nickname?: string;
  avatar_url?: string;
  phone?: string;
}
