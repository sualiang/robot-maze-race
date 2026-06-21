// 我的卡包 V2.0 - 完整重构
// 分类Tab: 参赛抵扣(type=1) / 到店满减(type=2) / 实物兑换(type=3)
var request = require('../../utils/request');

Page({
  data: {
    tabs: [
      { key: 0, label: '参赛抵扣金' },
      { key: 1, label: '立减券' },
      { key: 3, label: '满减券' },
      { key: 4, label: '兑换券' }
    ],
    currentTab: 1,
    coupons: [],
    isEmpty: false,
    loading: false
  },

  onLoad: function () {
    this.fetchCoupons();
  },

  onShow: function () {
    // 从其他页面返回时刷新
    this.fetchCoupons();
  },

  // Tab 切换
  onTabChange: function (e) {
    var key = parseInt(e.currentTarget.dataset.key, 10);
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key, coupons: [], isEmpty: false });
    this.fetchCoupons();
  },

  fetchCoupons: function () {
    var that = this;
    that.setData({ loading: true });

    var type = that.data.currentTab;

    // 参赛抵扣金走独立接口
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
            name: d.racePackageId ? '参赛包赠送' : '新用户专享',
            denominationCents: d.amountCents || 0,
            denominationYuan: (d.amountCents || 0) / 100,
            status: d.status === 'available' ? 1 : 0,
            statusText: d.status === 'available' ? '可用' : '已使用',
            createdAt: (d.createdAt || '').substring(0, 10),
            expiresAt: (d.expiresAt || '').substring(0, 10)
          };
        });

        that.setData({
          coupons: mapped,
          isEmpty: mapped.length === 0,
          loading: false
        });
      }).catch(function () {
        that.setData({ coupons: [], isEmpty: true, loading: false });
      });
      return;
    }

    // 商家消费券走 /player/coupons
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
      });

      that.setData({
        coupons: filtered,
        isEmpty: filtered.length === 0,
        loading: false
      });
    }).catch(function () {
      that.setData({
        coupons: [],
        isEmpty: true,
        loading: false
      });
    });
  },

  // 参赛抵扣券 -> 跳转首页参赛包
  onUseCoupon: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;

    var type = parseInt(item.coupon_type || item.type || 0, 10);

    if (type === 1 || type === 3 || type === 4) {
      // 商家消费券：立减券(1) / 满减券(3) / 兑换券(4) -> 展示核销二维码 + 导航
      this.showCouponDetail(item);
    } else if (type === 0) {
      // 参赛抵扣金 -> 跳首页购买参赛包
      wx.switchTab({ url: '/pages/index/index' });
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  // 展示券详情: 核销二维码 + 商家导航
  showCouponDetail: function (item) {
    var that = this;
    wx.showActionSheet({
      itemList: ['查看核销二维码', '导航到店'],
      success: function (res) {
        if (res.tapIndex === 0) {
          // 展示核销二维码
          that.showQRCode(item);
        } else if (res.tapIndex === 1) {
          // 导航到店
          that.navigateToStore(item);
        }
      },
      fail: function () {}
    });
  },

  // 展示核销二维码
  showQRCode: function (item) {
    var code = item.qrcode || item.qr_code || item.code || item.coupon_code || '';
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
    var lat = parseFloat(item.merchantLat || item.merchant_lat || item.store_lat || 0);
    var lng = parseFloat(item.merchantLng || item.merchant_lng || item.store_lng || 0);
    var name = item.merchantName || item.merchant_name || item.store_name || '商家';

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
  onGetCoupons: function () {
    wx.navigateTo({ url: '/pages/packages/packages' });
  }
});
