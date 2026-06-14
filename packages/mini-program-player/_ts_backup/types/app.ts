/**
 * 小程序全局类型定义
 * types/app.ts
 */

/** 用户基本信息 */
export interface IUserInfo {
  id: string;
  openid: string;
  nickname: string;
  avatarUrl: string;
  phone?: string;
  gender?: number;
  createdAt: string;
  updatedAt: string;
}

/** 全局 App 配置接口 */
export interface IAppOption {
  globalData: {
    userInfo: IUserInfo | null;
    token: string | null;
    isLoggedIn: boolean;
    systemInfo: WechatMiniprogram.SystemInfo | null;
  };
}

/** 微信登录凭证 */
export interface ILoginResult {
  token: string;
  userInfo: IUserInfo;
  isNewUser: boolean;
}

/** API 通用响应 */
export interface IApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

/** 分页参数 */
export interface IPaginationParams {
  page: number;
  pageSize: number;
}

/** 分页响应 */
export interface IPaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
