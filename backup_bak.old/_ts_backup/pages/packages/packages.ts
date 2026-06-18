// pages/packages/packages.ts
// 参赛包购买页：列表展示 + 微信支付调起
import { get, post } from '../../utils/request';
import { IRacePackage, IPackageOrder } from '../../types/package';

Page({
  data: {
    packageList: [] as IRacePackage[],
    loading: true,
    empty: false,
  },

  onLoad() {
    this.fetchPackageList();
  },

  onShow() {
    // 从其他页面返回时刷新（可能刚支付完）
  },

  onPullDownRefresh() {
    this.fetchPackageList().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 获取参赛包列表
   */
  async fetchPackageList() {
    this.setData({ loading: true });
    try {
      const list = await get<IRacePackage[]>('/player/packages');
      this.setData({
        packageList: list || [],
        loading: false,
        empty: !list || list.length === 0,
      });
    } catch (error) {
      console.error('获取参赛包列表失败', error);
      this.setData({ loading: false });
    }
  },

  /**
   * 「立即购买」按钮
   */
  onBuyPackage(e: WechatMiniprogram.TouchEvent) {
    const { id, name, saleprice } = e.currentTarget.dataset;
    if (!id) return;

    const priceYuan = (Number(saleprice) / 100).toFixed(2);
    wx.showModal({
      title: '确认购买',
      content: `确认购买「${name}」？\n售价 ¥${priceYuan}`,
      confirmText: '确认支付',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          this.createOrderAndPay(id);
        }
      },
    });
  },

  /**
   * ① 创建订单 → ② 获取支付参数 → ③ 调起微信支付
   */
  async createOrderAndPay(packageId: string) {
    try {
      wx.showLoading({ title: '下单中...', mask: true });

      // ① 创建订单
      const order = await post<{
        orderNo: string;
        paymentParams: WechatMiniprogram.RequestPaymentOption;
      }>('/player/orders', { packageId });

      wx.hideLoading();

      // ② 调起微信支付
      const { paymentParams } = order;
      const app = getApp<any>();

      wx.requestPayment({
        timeStamp: String(paymentParams.timeStamp),
        nonceStr: String(paymentParams.nonceStr),
        package: String(paymentParams.package),
        signType: (paymentParams as any).signType || 'MD5',
        paySign: String(paymentParams.paySign),
        success: () => {
          wx.showToast({ title: '购买成功！', icon: 'success', duration: 2000 });
          // 刷新列表（次数可能变化）
          setTimeout(() => this.fetchPackageList(), 1500);
        },
        fail: (payErr) => {
          if ((payErr as any).errMsg?.includes('cancel')) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            console.error('支付失败', payErr);
            wx.showToast({ title: '支付失败，请重试', icon: 'none' });
          }
        },
      });
    } catch (error: any) {
      wx.hideLoading();
      const msg = error?.message || '下单失败，请重试';
      console.error('下单支付失败', error);
      if (!msg.includes('取消')) {
        wx.showToast({ title: msg, icon: 'none' });
      }
    }
  },

  /**
   * 格式化价格（分 → 元，保留两位小数）
   */
  formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
  },

  /**
   * 格式化原价对比
   */
  getDiscountPercent(original: number, sale: number): string {
    if (original <= sale) return '';
    const pct = Math.round((1 - sale / original) * 100);
    return `${pct}折`;
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '热门参赛包限时抢购！快来参加机器狗迷宫竞速',
      path: '/pages/packages/packages',
      imageUrl: '/assets/images/share-package.png',
    };
  },
});
