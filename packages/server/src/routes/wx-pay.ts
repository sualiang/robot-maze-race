/**
 * 微信支付模块 —— JSAPI 支付（服务号内支付）
 *
 * 对接微信支付 API v3，实现：
 * 1. JSAPI 统一下单
 * 2. 支付结果回调通知
 * 3. 订单状态查询
 * 4. 退款申请
 * 5. 防重复支付 / 掉单兜底
 *
 * 前置条件：
 * - 微信商户号、APIv3密钥、商户证书已配置
 * - 支付回调 URL 已在商户平台设置或通过本接口配置
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query, queryOne, execute, transaction as dbTransaction, queryOp, queryOpOne, executeOp } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import {
  ApiResponse,
  WxPayUnifiedOrderRequest,
  WxPayUnifiedOrderResponse,
  WxPayNotifyResult,
  WxPayTransaction,
  WxPayRefundRequest,
  WxPayRefundResponse,
  OrderStatus,
} from '@robot-race/shared';

const router = Router();

// ============================================================
// 微信支付 API v3 工具函数
// ============================================================

const WECHAT_PAY_HOST = 'https://api.mch.weixin.qq.com';

/** 生成随机 nonce_str */
function nonceStr(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** 生成签名（SHA256 with RSA） */
function sign(method: string, url: string, timestamp: number, nonce: string, body: string): string {
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
  const privateKey = fs.readFileSync(config.wechatPay.privateKeyPath, 'utf-8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

/** 获取 Authorization header 值 */
function getAuthorization(method: string, path: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = nonceStr();
  const signature = sign(method, path, timestamp, nonce, body);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.wechatPay.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.wechatPay.merchantSerialNumber}"`;
}

/** 发起微信支付 API v3 请求 */
async function wechatPayRequest<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, any>
): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : '';
  const url = `${WECHAT_PAY_HOST}${path}`;
  const authorization = getAuthorization(method, path, bodyStr);

  const resp = await fetch(url, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'robot-maze-race/1.0',
    },
    body: bodyStr || undefined,
  });

  const respText = await resp.text();
  let respData: any;
  try {
    respData = JSON.parse(respText);
  } catch {
    respData = respText;
  }

  if (resp.status >= 400) {
    const errMsg = respData?.message || respData?.code || `HTTP ${resp.status}`;
    throw new Error(`微信支付 API 错误: ${errMsg}`);
  }

  return respData as T;
}

/** 解密回调通知中的 ciphertext */
function decryptNotify(ciphertext: string, associatedData: string, nonce: string): string {
  const key = config.wechatPay.apiV3Key;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'utf-8'),
    Buffer.from(nonce, 'utf-8')
  );
  decipher.setAAD(Buffer.from(associatedData, 'utf-8'));
  decipher.setAuthTag(Buffer.from(ciphertext.slice(-32), 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext.slice(0, -32), 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

/** 验证微信支付回调签名 */
function verifyNotifySign(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  serialNo: string
): boolean {
  // 简化验证：检查必要字段存在且签名匹配
  // 生产环境应严格验证平台证书序列号
  if (!timestamp || !nonce || !body || !signature) return false;

  const message = `${timestamp}\n${nonce}\n${body}\n`;
  // 使用微信平台公钥验证签名
  // 此处使用商户证书私钥验签作为简化方案
  // 生产环境需下载微信平台证书并验签
  try {
    const publicKey = crypto.createPublicKey(
      fs.readFileSync(config.wechatPay.privateKeyPath.replace('apiclient_key.pem', 'apiclient_cert.pem'), 'utf-8')
    );
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(message);
    verifier.end();
    return verifier.verify(publicKey, signature, 'base64');
  } catch {
    // 签名验证失败时，生产环境要拒绝请求
    // 开发环境放行
    console.warn('[WxPay] 回调签名验证不可用，跳过验证');
    return config.nodeEnv === 'development';
  }
}

// ============================================================
// 订单号生成（防碰撞）
// ============================================================

function generateOutTradeNo(): string {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RMR${datePart}${rand}`;
}

function generateRefundNo(): string {
  return `RF${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ============================================================
// 幂等锁（防重复支付）
// ============================================================

const payLocks = new Map<string, boolean>();

function acquirePayLock(orderId: string): boolean {
  if (payLocks.has(orderId)) return false;
  payLocks.set(orderId, true);
  return true;
}

function releasePayLock(orderId: string): void {
  payLocks.delete(orderId);
}

// ============================================================
// API 路由
// ============================================================

/**
 * POST /api/v1/pay/unified-order
 * 微信支付统一下单
 *
 * @header Authorization: Bearer <token>
 * @param body.order_id - 系统内部订单 ID
 * @param body.amount - 支付金额（分）
 * @param body.description - 商品描述
 */
router.post('/unified-order', authMiddleware, async (req: Request, res: Response<ApiResponse<WxPayUnifiedOrderResponse>>) => {
  try {
    const userId = req.user!.userId;
    const { order_id, amount, description } = req.body as WxPayUnifiedOrderRequest;

    if (!order_id || !amount || !description) {
      return res.status(400).json({ code: 400, message: '缺少必要参数', data: null as any });
    }

    // 1. 查询订单（同时验证所有权 + 状态）
    const order = await queryOpOne<{
      id: string;
      order_no: string;
      user_id: string;
      amount: number;
      status: string;
    }>(req, 
      `SELECT id, order_no, user_id, amount_cents as amount, status FROM orders WHERE id = ?`,
      [order_id]
    );

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在', data: null as any });
    }
    if (order.user_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权操作该订单', data: null as any });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ code: 400, message: `订单状态异常: ${order.status}`, data: null as any });
    }

    // 2. 防重复支付锁
    if (!acquirePayLock(order_id)) {
      return res.status(429).json({ code: 429, message: '支付处理中，请稍后', data: null as any });
    }

    // 3. 生成或复用 out_trade_no
    let outTradeNo = order.order_no;
    if (!outTradeNo) {
      outTradeNo = generateOutTradeNo();
      await executeOp(req, 'UPDATE orders SET order_no = ? WHERE id = ?', [outTradeNo, order_id]);
    }

    // 开发模式：模拟支付
    if (!config.wechatPay.mchId || config.nodeEnv === 'development') {
      console.log('[WxPay] 开发模式模拟下单:', outTradeNo, 'amount:', amount, 'description:', description);

      // 模拟 prepay_id
      const prepayId = `prepay_mock_${Date.now()}`;
      await executeOp(req, 
        `UPDATE orders SET payment_method = 'wechat_pay', prepay_id = ? WHERE id = ?`,
        [prepayId, order_id]
      );
      releasePayLock(order_id);

      return res.json({
        code: 0,
        message: '下单成功（开发模式）',
        data: {
          prepay_id: prepayId,
          jsapi_params: {
            appId: config.wechatMp.appId || 'mock_app_id',
            timeStamp: Math.floor(Date.now() / 1000).toString(),
            nonceStr: nonceStr(),
            package: `prepay_id=${prepayId}`,
            signType: 'RSA',
            paySign: 'mock_pay_sign',
          },
        },
      });
    }

    try {
      // 4. 调用微信统一下单 API
      const wxOrder = await wechatPayRequest<any>('POST', '/v3/pay/transactions/jsapi', {
        appid: config.wechatMp.appId,
        mchid: config.wechatPay.mchId,
        description: description.slice(0, 127), // 微信要求 ≤127 字符
        out_trade_no: outTradeNo,
        notify_url: config.wechatPay.notifyUrl,
        amount: {
          total: amount,
          currency: 'CNY',
        },
        payer: {
          openid: req.user!.openid,
        },
        attach: JSON.stringify({ order_id }),
      });

      // 5. 保存 prepay_id
      await executeOp(req, 
        `UPDATE orders SET payment_method = 'wechat_pay', prepay_id = ? WHERE id = ?`,
        [wxOrder.prepay_id, order_id]
      );

      // 6. 生成 JSAPI 调起参数
      const timeStamp = Math.floor(Date.now() / 1000).toString();
      const nonce = nonceStr();
      const pkg = `prepay_id=${wxOrder.prepay_id}`;

      const signStr = `${config.wechatMp.appId}\n${timeStamp}\n${nonce}\n${pkg}\n`;
      const paySign = crypto.createSign('RSA-SHA256')
        .update(signStr)
        .sign(fs.readFileSync(config.wechatPay.privateKeyPath, 'utf-8'), 'base64');

      releasePayLock(order_id);

      return res.json({
        code: 0,
        message: '下单成功',
        data: {
          prepay_id: wxOrder.prepay_id,
          jsapi_params: {
            appId: config.wechatMp.appId,
            timeStamp,
            nonceStr: nonce,
            package: pkg,
            signType: 'RSA',
            paySign,
          },
        },
      });
    } catch (err: any) {
      releasePayLock(order_id);
      throw err;
    }
  } catch (error: any) {
    console.error('[WxPay] unified-order error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '下单失败', data: null as any });
  }
});

/**
 * POST /api/v1/pay/notify
 * 微信支付结果回调通知
 *
 * 微信服务器 POST 到该 URL，无需客户端 Authorization
 * 需要验证签名、解密 ciphertext、更新订单状态
 */
router.post('/notify', async (req: Request, res: Response) => {
  try {
    const notifyData = req.body as WxPayNotifyResult;

    // 1. 验证签名
    const wechatSignature = req.headers['wechatpay-signature'] as string;
    const wechatTimestamp = req.headers['wechatpay-timestamp'] as string;
    const wechatNonce = req.headers['wechatpay-nonce'] as string;
    const wechatSerial = req.headers['wechatpay-serial'] as string;

    if (!verifyNotifySign(wechatTimestamp, wechatNonce, JSON.stringify(notifyData), wechatSignature, wechatSerial)) {
      console.error('[WxPay] 回调签名验证失败');
      return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
    }

    // 2. 解密交易信息
    const { ciphertext, associated_data, nonce } = notifyData.resource;
    let transaction: WxPayTransaction;
    try {
      transaction = JSON.parse(decryptNotify(ciphertext, associated_data, nonce));
    } catch (e: any) {
      console.error('[WxPay] 解密回调失败:', e.message);
      return res.status(400).json({ code: 'FAIL', message: '解密失败' });
    }

    const outTradeNo = transaction.out_trade_no;
    const tradeState = transaction.trade_state;

    console.log('[WxPay] 支付回调:', outTradeNo, 'state:', tradeState, 'amount:', transaction.amount?.total);

    // 3. 查询订单
    const order = await queryOpOne<{ id: string; status: string; amount: number }>(req, 
      `SELECT id, status, amount_cents as amount FROM orders WHERE order_no = ?`,
      [outTradeNo]
    );

    if (!order) {
      console.error('[WxPay] 回调订单不存在:', outTradeNo);
      return res.status(404).json({ code: 'FAIL', message: '订单不存在' });
    }

    // 4. 防重复处理：已支付或已取消不再处理
    if (order.status === 'paid' || order.status === 'cancelled') {
      console.log('[WxPay] 订单已处理，跳过:', outTradeNo, 'status:', order.status);
      return res.json({ code: 'SUCCESS', message: 'OK' });
    }

    // 5. 根据支付状态更新
    if (tradeState === 'SUCCESS') {
      // 金额校验（防篡改）
      const paidAmount = transaction.amount?.total;
      if (paidAmount && paidAmount !== order.amount) {
        console.error('[WxPay] 支付金额不匹配! order:', order.amount, 'paid:', paidAmount, outTradeNo);
        // 标记异常待人工处理
        await executeOp(req, 
          `UPDATE orders SET status = 'abnormal', payment_remark = ? WHERE id = ?`,
          [`金额不匹配: 订单${order.amount}分, 实付${paidAmount}分`, order.id]
        );
        return res.json({ code: 'SUCCESS', message: 'OK' });
      }

      // 更新订单状态（operator 库，事务外）
      await executeOp(req, 
        `UPDATE orders SET status = 'paid', transaction_id = $1, paid_at = NOW(), updated_at = NOW() WHERE id = $2 AND status = 'pending'`,
        [transaction.transaction_id, order.id]
      );

      // 记录支付流水（operator 库，事务外）
      await executeOp(req, 
        `INSERT INTO payment_transactions (id, order_id, user_id, amount, transaction_id, payment_method, status, created_at)
         VALUES ($1, $2, (SELECT user_id FROM orders WHERE id = $3), $4, $5, 'wechat_pay', 'success', NOW())`,
        [uuidv4(), order.id, order.id, order.amount, transaction.transaction_id]
      );

      // 处理参赛包发放（已有逻辑由原有 order 模块处理，此处只记录）
      console.log('[WxPay] 支付成功:', outTradeNo, 'transaction_id:', transaction.transaction_id);
    } else if (['CLOSED', 'PAYERROR', 'REVOKED'].includes(tradeState)) {
      await executeOp(req, 
        `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND status = 'pending'`,
        [order.id]
      );
      console.log('[WxPay] 支付失败/关闭:', outTradeNo, 'state:', tradeState);
    }

    return res.json({ code: 'SUCCESS', message: 'OK' });
  } catch (error: any) {
    console.error('[WxPay] notify error:', error.message);
    // 微信要求即使处理失败也返回 SUCCESS 以避免重复推送
    return res.json({ code: 'SUCCESS', message: 'error handled' });
  }
});

/**
 * GET /api/v1/pay/query/:orderId
 * 查询支付订单状态（客户端查询 + 掉单兜底）
 *
 * @header Authorization: Bearer <token>
 */
router.get('/query/:orderId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { orderId } = req.params;

    const order = await queryOpOne<{
      id: string;
      order_no: string;
      user_id: string;
      amount: number;
      status: string;
      transaction_id: string;
      prepay_id: string;
      paid_at: string;
    }>(req, 
      `SELECT id, order_no, user_id, amount_cents as amount, status, transaction_id, prepay_id, paid_at FROM orders WHERE id = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在', data: null });
    }
    if (order.user_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权查看该订单', data: null });
    }

    // 如果订单仍在 pending 状态，尝试查询微信侧状态（掉单兜底）
    if (order.status === 'pending' && order.order_no && config.wechatPay.mchId) {
      try {
        const wxOrder = await wechatPayRequest<any>(
          'GET',
          `/v3/pay/transactions/out-trade-no/${order.order_no}?mchid=${config.wechatPay.mchId}`
        );

        if (wxOrder.trade_state === 'SUCCESS') {
          // 兜底更新为已支付
          await executeOp(req, 
            `UPDATE orders SET status = 'paid', transaction_id = ?, paid_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'pending'`,
            [wxOrder.transaction_id, order.id]
          );
          order.status = 'paid';
          order.transaction_id = wxOrder.transaction_id;
          console.log('[WxPay] 兜底发现已支付订单:', order.order_no, 'transaction_id:', wxOrder.transaction_id);
        } else if (['CLOSED', 'PAYERROR'].includes(wxOrder.trade_state)) {
          await executeOp(req, 
            `UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'`,
            [order.id]
          );
          order.status = 'cancelled';
        }
      } catch (e: any) {
        console.warn('[WxPay] 查询微信侧订单失败:', e.message);
      }
    }

    return res.json({
      code: 0,
      data: {
        id: order.id,
        orderNo: order.order_no,
        amount: order.amount,
        status: order.status,
        transactionId: order.transaction_id,
        paidAt: order.paid_at,
      },
    });
  } catch (error: any) {
    console.error('[WxPay] query error:', error.message);
    return res.status(500).json({ code: 500, message: '查询失败', data: null });
  }
});

/**
 * POST /api/v1/pay/refund
 * 申请退款
 *
 * @header Authorization: Bearer <token>
 * @param body.order_id - 订单 ID
 * @param body.refund_amount - 退款金额（分），不传则全额退款
 * @param body.reason - 退款原因
 */
router.post('/refund', authMiddleware, async (req: Request, res: Response<ApiResponse<WxPayRefundResponse>>) => {
  try {
    const userId = req.user!.userId;
    const { order_id, refund_amount, reason } = req.body as WxPayRefundRequest;

    if (!order_id) {
      return res.status(400).json({ code: 400, message: '缺少订单 ID', data: null as any });
    }

    const order = await queryOpOne<{
      id: string;
      order_no: string;
      user_id: string;
      amount: number;
      status: string;
      transaction_id: string;
    }>(req, 
      `SELECT id, order_no, user_id, amount_cents as amount, status, transaction_id FROM orders WHERE id = ?`,
      [order_id]
    );

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在', data: null as any });
    }
    if (order.user_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权操作该订单', data: null as any });
    }
    if (order.status !== 'paid') {
      return res.status(400).json({ code: 400, message: `订单状态不支持退款: ${order.status}`, data: null as any });
    }

    const refundAmount = refund_amount || order.amount;

    // 开发模式：模拟退款
    if (!config.wechatPay.mchId || config.nodeEnv === 'development') {
      const refundId = `refund_mock_${Date.now()}`;
      await executeOp(req, 
        `UPDATE orders SET status = 'refunding', refund_id = ?, updated_at = NOW() WHERE id = ?`,
        [refundId, order_id]
      );
      console.log('[WxPay] 开发模式模拟退款:', order_id, 'amount:', refundAmount);
      return res.json({
        code: 0,
        message: '退款申请成功（开发模式）',
        data: {
          refund_id: refundId,
          out_refund_no: generateRefundNo(),
          transaction_id: order.transaction_id || '',
          out_trade_no: order.order_no,
          channel: 'ORIGINAL',
          status: 'PROCESSING',
          amount: { total: order.amount, refund: refundAmount, payer_total: order.amount, payer_refund: refundAmount },
        },
      });
    }

    const outRefundNo = generateRefundNo();

    const wxRefund = await wechatPayRequest<any>('POST', '/v3/refund/domestic/refunds', {
      transaction_id: order.transaction_id,
      out_trade_no: order.order_no,
      out_refund_no: outRefundNo,
      reason: reason || '用户申请退款',
      notify_url: config.wechatPay.refundNotifyUrl || config.wechatPay.notifyUrl,
      amount: {
        refund: refundAmount,
        total: order.amount,
        currency: 'CNY',
      },
    });

    await executeOp(req, 
      `UPDATE orders SET status = 'refunding', refund_id = ?, refund_amount = ?, updated_at = NOW() WHERE id = ?`,
      [wxRefund.refund_id, refundAmount, order_id]
    );

    console.log('[WxPay] 退款申请成功:', order_id, 'refund_id:', wxRefund.refund_id, 'amount:', refundAmount);

    return res.json({
      code: 0,
      message: '退款申请成功',
      data: {
        refund_id: wxRefund.refund_id,
        out_refund_no: outRefundNo,
        transaction_id: order.transaction_id,
        out_trade_no: order.order_no,
        channel: wxRefund.channel,
        status: wxRefund.status,
        amount: wxRefund.amount,
      },
    });
  } catch (error: any) {
    console.error('[WxPay] refund error:', error.message);
    return res.status(500).json({ code: 500, message: error.message || '退款失败', data: null as any });
  }
});

/**
 * POST /api/v1/pay/notify-refund
 * 微信退款结果回调通知
 */
router.post('/notify-refund', async (req: Request, res: Response) => {
  try {
    const notifyData = req.body as WxPayNotifyResult;

    const { ciphertext, associated_data, nonce } = notifyData.resource;
    let refundResult: any;
    try {
      refundResult = JSON.parse(decryptNotify(ciphertext, associated_data, nonce));
    } catch (e: any) {
      console.error('[WxPay] 退款回调解密失败:', e.message);
      return res.json({ code: 'SUCCESS', message: 'OK' });
    }

    console.log('[WxPay] 退款回调:', refundResult.out_trade_no, 'status:', refundResult.refund_status);

    if (refundResult.refund_status === 'SUCCESS') {
      await executeOp(req, 
        `UPDATE orders SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
         WHERE order_no = ? AND status = 'refunding'`,
        [refundResult.out_trade_no]
      );

      // 更新支付流水
      await executeOp(req, 
        `UPDATE payment_transactions SET status = 'refunded', refund_id = ?, updated_at = NOW()
         WHERE transaction_id = ?`,
        [refundResult.refund_id, refundResult.transaction_id]
      );
    } else if (refundResult.refund_status === 'ABNORMAL') {
      console.error('[WxPay] 退款异常:', refundResult.out_trade_no, refundResult.refund_id);
    }

    return res.json({ code: 'SUCCESS', message: 'OK' });
  } catch (error: any) {
    console.error('[WxPay] notify-refund error:', error.message);
    return res.json({ code: 'SUCCESS', message: 'error handled' });
  }
});

/**
 * POST /api/v1/pay/mock-pay-success
 * 开发模式：模拟支付成功（用于测试支付回调流程）
 *
 * @header Authorization: Bearer <token>
 * @param body.order_id - 订单 ID
 */
router.post('/mock-pay-success', authMiddleware, async (req: Request, res: Response) => {
  if (config.nodeEnv === 'production' && config.wechatPay.mchId) {
    return res.status(403).json({ code: 403, message: '生产环境禁止使用模拟支付', data: null });
  }

  try {
    const userId = req.user!.userId;
    const { order_id } = req.body;

    const order = await queryOpOne<{ id: string; user_id: string; status: string }>(req, 
      `SELECT id, user_id, status FROM orders WHERE id = ?`,
      [order_id]
    );

    if (!order) {
      return res.status(404).json({ code: 404, message: '订单不存在', data: null });
    }
    if (order.user_id !== userId) {
      return res.status(403).json({ code: 403, message: '无权操作', data: null });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ code: 400, message: `订单状态不支持模拟支付: ${order.status}`, data: null });
    }

    await executeOp(req, 
      `UPDATE orders SET status = 'paid', transaction_id = ?, paid_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'pending'`,
      [`test_txn_${Date.now()}`, order_id]
    );

    return res.json({ code: 0, message: '模拟支付成功' });
  } catch (error: any) {
    console.error('[WxPay] mock-pay-success error:', error.message);
    return res.status(500).json({ code: 500, message: '模拟支付失败', data: null });
  }
});

export default router;
