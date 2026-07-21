/**
 * 微信服务号相关类型定义
 * 覆盖：OAuth 登录、支付、模板消息三大模块
 */

// ============================================================
// 微信服务号 OAuth 登录
// ============================================================

/** 微信网页授权请求 */
export interface WxMpLoginRequest {
  /** 微信 OAuth 授权 code */
  code: string;
  /** 用户手机号（可选，绑定已有手机号账户时使用） */
  phone?: string;
  /** 用户昵称（可选，首次注册时使用） */
  nickname?: string;
  /** 用户头像（可选） */
  avatar_url?: string;
}

/** 微信网页授权响应 */
export interface WxMpLoginResponse {
  token: string;
  user: {
    id: string;
    openid: string;
    unionid?: string;
    nickname: string;
    avatar_url: string;
    phone: string;
    role: string;
  };
  is_new_user: boolean;
}

/** 微信 OAuth AccessToken 响应 */
export interface WxOAuthAccessTokenResult {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/** 微信用户信息 */
export interface WxUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
}

// ============================================================
// 微信支付
// ============================================================

/** 微信支付下单请求 */
export interface WxPayUnifiedOrderRequest {
  /** 订单号（系统内部） */
  order_id: string;
  /** 支付金额（分） */
  amount: number;
  /** 商品描述 */
  description: string;
}

/** 微信支付下单响应 */
export interface WxPayUnifiedOrderResponse {
  /** 预支付交易会话标识 */
  prepay_id: string;
  /** JSAPI 调起支付所需参数 */
  jsapi_params?: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  };
}

/** 微信支付回调通知 */
export interface WxPayNotifyResult {
  id: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: {
    original_type: string;
    algorithm: string;
    ciphertext: string;
    associated_data: string;
    nonce: string;
  };
}

/** 支付通知解密后的交易信息 */
export interface WxPayTransaction {
  mchid: string;
  appid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: string;
  trade_state_desc: string;
  bank_type: string;
  attach: string;
  success_time: string;
  payer: {
    openid: string;
  };
  amount: {
    total: number;
    payer_total: number;
    currency: string;
    payer_currency: string;
  };
}

/** 微信支付退款请求 */
export interface WxPayRefundRequest {
  /** 订单号 */
  order_id: string;
  /** 退款金额（分），不传则全额退款 */
  refund_amount?: number;
  /** 退款原因 */
  reason?: string;
}

/** 微信支付退款响应 */
export interface WxPayRefundResponse {
  refund_id: string;
  out_refund_no: string;
  transaction_id: string;
  out_trade_no: string;
  channel: string;
  status: string;
  amount: {
    total: number;
    refund: number;
    payer_total: number;
    payer_refund: number;
  };
}

// ============================================================
// 微信服务号消息通知（模板消息）
// ============================================================

/** 模板消息推送请求 */
export interface WxTemplateMessageRequest {
  /** 接收消息的用户 openid */
  touser: string;
  /** 模板 ID */
  template_id: string;
  /** 跳转 URL（可选） */
  url?: string;
  /** 小程序跳转（可选） */
  miniprogram?: {
    appid: string;
    pagepath: string;
  };
  /** 模板数据 */
  data: Record<string, { value: string; color?: string }>;
  /** 防重入 client_msg_id（可选） */
  client_msg_id?: string;
}

/** 模板消息推送结果 */
export interface WxTemplateMessageResult {
  errcode: number;
  errmsg: string;
  msgid: number;
}

/** 通知场景枚举 */
export enum NotificationScene {
  /** 赛事提醒：决赛开始前推送 */
  RACE_REMINDER = 'race_reminder',
  /** 运营提醒：积分兑换到期 */
  POINTS_EXPIRE = 'points_expire',
  /** 运营提醒：优惠券到期 */
  COUPON_EXPIRE = 'coupon_expire',
  /** 运营提醒：库存不足 */
  STOCK_SHORTAGE = 'stock_shortage',
  /** 订单状态通知 */
  ORDER_STATUS = 'order_status',
  /** 赛事结果通知 */
  RACE_RESULT = 'race_result',
  /** 奖励到账通知 */
  REWARD_ARRIVED = 'reward_arrived',
  /** 系统公告 */
  SYSTEM_NOTICE = 'system_notice',
  /** 裁判审核结果通知 */
  REFEREE_REVIEW = 'referee_review',
}

/** 通知模板配置 */
export interface NotificationTemplate {
  /** 场景标识 */
  scene: NotificationScene;
  /** 微信模板 ID */
  template_id: string;
  /** 模板名称（管理用） */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 跳转 URL 模板（支持 ${} 变量替换） */
  url_template?: string;
}

/** 通知发送日志 */
export interface NotificationLog {
  id: string;
  scene: string;
  user_id: string;
  openid: string;
  template_id: string;
  content: string;
  status: 'success' | 'failed';
  error_msg?: string;
  created_at: string;
}
