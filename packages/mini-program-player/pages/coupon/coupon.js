// 我的卡券 V3.0 - 4Tab 统一页面
// Tab 0: 参赛抵扣卡（独立接口 /player/deductions）
// Tab 1: 立减券（coupon_type=1）
// Tab 2: 满减券（coupon_type=3）
// Tab 3: 兑换券（coupon_type=4）
var request = require('../../utils/request');

Page({
  data: {
    // 4个Tab
    tabs: [
      { key: 0, label: '参赛抵扣卡' },
      { key: 1, label: '立减券' },
      { key: 3, label: '满减券' },
      { key: 4, label: '兑换券' }
    ],
    currentTab: 0,
    cardList: [],
    isEmpty: false,
    loading: false,
    pageTitle: '我的卡券'
  },

  onLoad: function () {
    this.fetchCards();
  },

  onShow: function () {
    // 从其他页面返回时刷新
    this.fetchCards();
  },

  // Tab 切换
  onTabChange: function (e) {
    var key = parseInt(e.currentTarget.dataset.key, 10);
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key, cardList: [], isEmpty: false });
    this.fetchCards();
  },

  fetchCards: function () {
    var that = this;
    that.setData({ loading: true });

    var type = that.data.currentTab;

    // === Tab 0: 参赛抵扣卡（独立接口） ===
    if (type === 0) {
      request.get('/player/deductions', {}).then(function (res) {
        var list = [];
        if (Array.isArray(res)) {
          list = res;
        } else if (res && Array.isArray(res.list)) {
          list = res.list;
        } else if (res && res.data && Array.isArray(res.data.list)) {
          list = res.data.list;
        }

        var mapped = list.map(function (d) {
          return {
            id: d.id,
            // 参赛抵扣卡专用字段
            isDeduction: true,
            source: d.racePackageId ? '参赛包赠送' : '新用户专享',
            amountYuan: (d.amountCents || 0) / 100,
            amountText: ((d.amountCents || 0) / 100).toFixed(2) + '元',
            status: d.status === 'available' ? 1 : 0,
            statusText: d.status === 'available' ? '可用' : '已使用',
            createdAt: (d.createdAt || '').substring(0, 10),
            expiresAt: (d.expiresAt || '').substring(0, 10)
          };
        });

        that.setData({
          cardList: mapped,
          isEmpty: mapped.length === 0,
          loading: false
        });
      }).catch(function () {
        that.setData({ cardList: [], isEmpty: true, loading: false });
      });
      return;
    }

    // === Tab 1/2/3: 商家消费券（/player/coupons） ===
    request.get('/player/coupons', {}).then(function (res) {
      var list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && Array.isArray(res.list)) {
        list = res.list;
      } else if (res && Array.isArray(res.data)) {
        list = res.data;
      }

      var filtered = list.filter(function (item) {
        return parseInt(item.coupon_type || item.type || 0, 10) === type;
      }).map(function (item) {
        // 统一消费券展示字段
        return {
          id: item.id || item._id,
          isDeduction: false,
          // 商家信息
          merchantName: item.merchantName || item.merchant_name || item.store_name || '商家',
          merchantLat: item.merchantLat || item.merchant_lat || item.store_lat || 0,
          merchantLng: item.merchantLng || item.merchant_lng || item.store_lng || 0,
          // 券信息
          name: item.name || item.title || '消费券',
          couponType: parseInt(item.coupon_type || item.type || 0, 10),
          denominationCents: item.denominationCents || item.denomination_cents || item.amountCents || item.value || 0,
          denominationYuan: ((item.denominationCents || item.denomination_cents || item.amountCents || item.value || 0)) / 100,
          minConsumeCents: item.minConsumeCents || item.min_consume_cents || 0,
          minConsumeYuan: ((item.minConsumeCents || item.min_consume_cents || 0)) / 100,
          // 状态
          status: item.status === 0 || item.status === 'available' || item.used === 0 ? 1 : 0,
          statusText: item.status === 0 || item.status === 'available' || item.used === 0 ? '可用' : (item.used === 1 ? '已使用' : '已过期'),
          // 有效期
          validStart: (item.validStart || item.valid_start || item.startDate || item.start_date || '').substring(0, 10),
          validEnd: (item.validEnd || item.valid_end || item.expireDate || item.expire_date || '').substring(0, 10),
          // 核销码
          qrCode: item.qrcode || item.qr_code || item.code || item.coupon_code || ''
        };
      });

      that.setData({
        cardList: filtered,
        isEmpty: filtered.length === 0,
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

  // 点击卡片
  onCardTap: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.isDeduction) {
      // 参赛抵扣卡 -> 跳首页购买参赛包
      wx.switchTab({ url: '/pages/index/index' });
    } else {
      // 消费券 -> 展示操作菜单
      this.showCouponDetail(item);
    }
  },

  // 展示券详情: 核销二维码 + 商家导航
  showCouponDetail: function (item) {
    var that = this;
    wx.showActionSheet({
      itemList: ['查看核销二维码', '导航到店'],
      success: function (res) {
        if (res.tapIndex === 0) {
          that.showQRCode(item);
        } else if (res.tapIndex === 1) {
          that.navigateToStore(item);
        }
      },
      fail: function () {}
    });
  },

  // 展示核销二维码
  showQRCode: function (item) {
    var code = item.qrCode || '';
    if (!code) {
      wx.showToast({ title: '暂无核销码', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '核销二维码',
      content: '核销码: ' + code + '\n请向商家出示',
      showCancel: false
    });
  },

  // 导航到店
  navigateToStore: function (item) {
    var lat = parseFloat(item.merchantLat || 0);
    var lng = parseFloat(item.merchantLng || 0);
    var name = item.merchantName || '商家';

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      wx.showToast({ title: '暂无门店地址', icon: 'none' });
      return;
    }

    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: name,
      scale: 15
    });
  },

  // 去获取 -> 跳转参赛包购买
  onGetCards: function () {
    wx.navigateTo({ url: '/pages/packages/packages' });
  }
});
