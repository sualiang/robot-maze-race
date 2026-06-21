// 我的卡券 V3.5 - 4Tab 统一页面
// Tab 0: 参赛抵扣卡（独立接口 /player/deductions）
// Tab 1: 立减券（coupon_type=1）
// Tab 2: 满减券（coupon_type=3）
// Tab 3: 兑换券（coupon_type=4）
// 排序: 未使用(1) > 已使用(0) > 已过期(-1)
var request = require('../../utils/request');

Page({
  data: {
    // 4个Tab
    tabs: [
      { key: 0, label: '🏆 参赛抵扣卡' },
      { key: 1, label: '🏪 立减券' },
      { key: 3, label: '🏪 满减券' },
      { key: 4, label: '🏪 兑换券' }
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

    // === Tab 0: 参赛抵扣卡（独立接口 /player/deductions） ===
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
          // 状态: available=未使用(1), used/expired=已使用过期(0)
          var status = d.status === 'available' ? 1 : 0;
          return {
            id: d.id,
            // 参赛抵扣卡专用字段
            isDeduction: true,
            source: d.racePackageId ? '参赛包赠送' : '新用户专享',
            amountYuan: (d.amountCents || 0) / 100,
            amountText: ((d.amountCents || 0) / 100).toFixed(2) + '元',
            status: status,
            statusText: status === 1 ? '可用' : (d.status === 'used' ? '已使用' : '已过期'),
            createdAt: (d.createdAt || '').substring(0, 10),
            expiresAt: (d.expiresAt || '').substring(0, 10),
            // 排序权重：未使用=0，已使用/过期=1
            _sortWeight: status === 1 ? 0 : 1
          };
        });

        // 排序：未使用优先
        mapped.sort(function (a, b) { return a._sortWeight - b._sortWeight; });

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

    // === Tab 1/2/3: 商家消费券（/player/coupons?type=X） ===
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
        // 解析券状态: status=1 或 status='available' 或 used=0 → 未使用
        var rawStatus = item.status;
        var isAvailable = rawStatus === 1 || rawStatus === 'available' || rawStatus === 0 || item.used === 0;
        var isExpired = rawStatus === -1 || rawStatus === 'expired' || item.used === -1;

        var displayStatus = 0; // 默认已使用
        if (isAvailable) displayStatus = 1;
        else if (isExpired) displayStatus = -1;

        var statusText = '已使用';
        if (displayStatus === 1) statusText = '可用';
        else if (displayStatus === -1) statusText = '已过期';

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
          qrCode: item.qrcode || item.qr_code || item.code || item.coupon_code || '',
          // 排序权重：未使用=0 < 已使用=1 < 已过期=2
          _sortWeight: displayStatus === 1 ? 0 : (displayStatus === 0 ? 1 : 2)
        };
      });

      // 排序：未使用(权重0) → 已使用(权重1) → 已过期(权重2)
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

  // 点击卡片
  onCardTap: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.isDeduction) {
      // 参赛抵扣卡 -> 跳首页购买参赛包使用
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
  },

  // 跳转兑换记录（预留积分兑换记录页）
  onExchangeRecords: function () {
    wx.navigateTo({ url: '/pages/prize/prize' });
  }
});
