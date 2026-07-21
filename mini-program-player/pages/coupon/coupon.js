// 我的卡券 V3.6 - 3Tab 统一页面（参赛抵扣卡已废弃）
// Tab 1: 立减券（coupon_type=1）
// Tab 2: 满减券（coupon_type=3）
// Tab 3: 兑换券（coupon_type=4）
// 排序: 未使用(1) > 已使用(0) > 已过期(-1)
var request = require('../../utils/request');

Page({
  data: {
    // 3个Tab
    tabs: [
      { key: 1, label: '🏪 立减券' },
      { key: 3, label: '🏪 满减券' },
      { key: 4, label: '🏪 兑换券' }
    ],
    currentTab: 1,
    cardList: [],
    isEmpty: false,
    loading: false,
    pageTitle: '我的卡券',
    // 核销弹窗
    showVerifyModal: false,
    verifyItem: null
  },

  onLoad: function (options) {
    // 支持从外部传 tab 参数：1=立减券 3=满减券 4=兑换券
    var defaultTab = 1;
    if (options && options.tab !== undefined) {
      var parsed = parseInt(options.tab, 10);
      if (!isNaN(parsed) && [0, 1, 3, 4].indexOf(parsed) !== -1) {
        defaultTab = parsed;
      }
    }
    this.setData({ currentTab: defaultTab });
    this.fetchCards();
  },

  onShow: function () {
    this.fetchCards();
  },

  // Tab 切换
  onTabChange: function (e) {
    var key = parseInt(e.currentTarget.dataset.key, 10);
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key, cardList: [], isEmpty: false, showVerifyModal: false });
    this.fetchCards();
  },

  fetchCards: function () {
    var that = this;
    that.setData({ loading: true });

    var type = that.data.currentTab;

    // 商家消费券（/player/coupons?type=X）
    request.get('/player/coupons', { type: type }).then(function (res) {
      var list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && Array.isArray(res.list)) {
        list = res.list;
      } else if (res && Array.isArray(res.data)) {
        list = res.data;
      }

      var mapped = list.map(function (item) {
        var rawStatus = item.status;
        var isAvailable = rawStatus === 1 || rawStatus === 'available' || rawStatus === 0 || item.used === 0;
        var isExpired = rawStatus === -1 || rawStatus === 'expired' || item.used === -1;

        var displayStatus = 0;
        if (isAvailable) displayStatus = 1;
        else if (isExpired) displayStatus = -1;

        var statusText = '已使用';
        if (displayStatus === 1) statusText = '有效';
        else if (displayStatus === -1) statusText = '超期';

        return {
          id: item.id || item._id,
          isDeduction: false,
          // 商家信息
          merchantName: item.merchantName || item.merchant_name || item.store_name || '',
          merchantLogo: item.merchantLogo || item.merchant_logo || item.logo_url || '',
          merchantAddress: item.merchantAddress || item.merchant_address || '',
          merchantLat: parseFloat(item.merchantLat || item.merchant_lat || item.store_lat || 0),
          merchantLng: parseFloat(item.merchantLng || item.merchant_lng || item.store_lng || 0),
          // 券信息
          name: item.name || item.title || '消费券',
          description: item.description || '',
          couponType: parseInt(item.coupon_type || item.type || 0, 10),
          denominationCents: item.denominationCents || item.denomination_cents || item.amountCents || item.value || 0,
          denominationYuan: ((item.denominationCents || item.denomination_cents || item.amountCents || item.value || 0)) / 100,
          minConsumeCents: item.minConsumeCents || item.min_consume_cents || 0,
          minConsumeYuan: ((item.minConsumeCents || item.min_consume_cents || 0)) / 100,
          // 状态
          status: displayStatus,
          statusText: statusText,
          // 有效期
          validStart: (item.validStart || item.valid_start || item.startDate || item.start_date || '').substring(0, 10),
          validEnd: (item.validEnd || item.valid_end || item.expireDate || item.expire_date || '').substring(0, 10),
          // 核销码
          verifyCode: item.verifyCode || item.verify_code || item.qrcode || item.qr_code || item.code || item.coupon_code || '',
          // 排序权重
          _sortWeight: displayStatus === 1 ? 0 : (displayStatus === 0 ? 1 : 2)
        };
      });

      mapped.sort(function (a, b) { return a._sortWeight - b._sortWeight; });

      that.setData({
        cardList: mapped,
        isEmpty: mapped.length === 0,
        loading: false
      });
    }).catch(function () {
      that.setData({
        cardList: [],
        isEmpty: true,
        loading: false
      });
    });
  },

  // ========== 消费券「立即使用」按钮 ==========
  onUseCoupon: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;

    // 只对未使用的消费券生效
    if (item.status !== 1) return;

    this.setData({
      showVerifyModal: true,
      verifyItem: item
    });
  },

  // 关闭核销弹窗
  onCloseVerify: function () {
    this.setData({
      showVerifyModal: false,
      verifyItem: null
    });
  },

  // ========== 导航到店 ==========
  onNavigateStore: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;

    var lat = parseFloat(item.merchantLat || 0);
    var lng = parseFloat(item.merchantLng || 0);
    var name = item.merchantName || '商家';
    var address = item.merchantAddress || '';

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      wx.showToast({ title: '暂无门店地址', icon: 'none' });
      return;
    }

    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: name,
      address: address,
      scale: 15
    });
  },

  // 去获取 -> 跳转参赛包购买
  onGetCards: function () {
    wx.navigateTo({ url: '/pages/packages/packages' });
  },

  // 跳转兑换记录
  onExchangeRecords: function () {
    wx.navigateTo({ url: '/pages/prize/prize' });
  }
});
