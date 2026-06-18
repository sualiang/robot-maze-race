// pages/packages/packages.js - 参赛包购买页
var request = require('../../utils/request');

Page({
  data: {
    // 用户信息
    remainCount: 0,

    // 参赛包列表
    packageList: [],
    loading: true,
    empty: false,

    // 当前选中的参赛包
    pendingPackageId: null,
    pendingPackageName: '',
    pendingPackagePrice: 0,
    pendingPackageCount: 0,

    // 扫码来源参数
    venueId: null
  },

  onLoad: function (options) {
    var that = this;
    // 记录 venue_id 参数（可能为扫码来源）
    if (options && options.venue_id) {
      that.setData({ venueId: options.venue_id });
    }

    // 并行拉取参赛包列表 + 用户信息
    that.fetchAllData();
  },

  onShow: function () {},

  onPullDownRefresh: function () {
    var that = this;
    that.fetchAllData().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 并行获取所有数据
   */
  fetchAllData: function () {
    var that = this;
    that.setData({ loading: true });

    return Promise.all([
      that.fetchPackageList(),
      that.fetchUserInfo()
    ]).then(function () {
      that.setData({ loading: false });
    }).catch(function () {
      that.setData({ loading: false });
    });
  },

  /**
   * 获取参赛包列表
   * GET /player/packages
   */
  fetchPackageList: function () {
    var that = this;
    return request.get('/player/packages').then(function (res) {
      var list = [];
      if (Array.isArray(res)) list = res;
      else if (res && res.code === 0 && Array.isArray(res.data)) list = res.data;
      else if (res && Array.isArray(res.list)) list = res.list;
      var items = list || [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        // 格式化价格：分 → 元
        item.salePriceText = (item.salePrice / 100).toFixed(0);
        item.originalPriceText = (item.originalPrice / 100).toFixed(0);
        // 标签
        if (item.isHot) {
          item.tag = '🔥 热门';
          item.tagType = 'hot';
        } else if (item.isRecommend) {
          item.tag = '💎 推荐';
          item.tagType = 'recommend';
        }
      }
      that.setData({
        packageList: items,
        empty: items.length === 0
      });
    }).catch(function (err) {
      console.error('获取参赛包列表失败', err);
      that.setData({ empty: true });
    });
  },

  /**
   * 获取用户信息（剩余次数）
   * GET /player/me/profile-check
   */
  fetchUserInfo: function () {
    var that = this;
    return request.get('/player/me/profile-check').then(function (profile) {
      var remain = (profile && profile.remainCount != null) ? profile.remainCount : 0;
      that.setData({ remainCount: remain });
    }).catch(function (err) {
      console.error('获取用户信息失败', err);
    });
  },

  /**
   * 点击「立即购买」
   */
  onBuyPackage: function (e) {
    var dataset = e.currentTarget.dataset;
    var packageId = dataset.id;
    var packageName = dataset.name;
    var price = dataset.price;
    var count = dataset.count;

    if (!packageId) return;

    // 缓存当前选中的参赛包
    this.setData({
      pendingPackageId: packageId,
      pendingPackageName: packageName,
      pendingPackagePrice: price,
      pendingPackageCount: count
    });

    this.createOrder();
  },

  /**
   * 下单 & 支付
   */
  createOrder: function () {
    var that = this;
    var packageId = this.data.pendingPackageId;
    if (!packageId) return;

    wx.showLoading({ title: '下单中...', mask: true });

    request.post('/player/orders', {
      packageId: packageId
    }).then(function (order) {
      wx.hideLoading();

      // 检查是否返回了支付参数（微信支付）
      var pp = order && order.paymentParams;
      if (pp) {
        // 发起微信支付
        that.requestPayment(pp, order);
      } else {
        // 无支付参数（可能免费或不需要支付），直接视为成功
        that.onOrderSuccess(order);
      }
    }).catch(function (err) {
      wx.hideLoading();
      var msg = (err && err.message) || '下单失败，请重试';
      console.error('下单失败', err);
      if (msg.indexOf('取消') < 0) {
        wx.showToast({ title: msg, icon: 'none' });
      }
    });
  },

  /**
   * 调起微信支付
   */
  requestPayment: function (pp, order) {
    var that = this;
    wx.requestPayment({
      timeStamp: String(pp.timeStamp || pp.timestamp || ''),
      nonceStr: String(pp.nonceStr || ''),
      package: String(pp.package || ''),
      signType: pp.signType || 'MD5',
      paySign: String(pp.paySign || ''),
      success: function () {
        that.onOrderSuccess(order);
      },
      fail: function (payErr) {
        if (payErr && payErr.errMsg && payErr.errMsg.indexOf('cancel') >= 0) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          console.error('支付失败', payErr);
          wx.showToast({ title: '支付失败，请重试', icon: 'none' });
        }
      }
    });
  },

  /**
   * 订单成功处理
   */
  onOrderSuccess: function (order) {
    var that = this;

    wx.showToast({
      title: '购买成功！',
      icon: 'success',
      duration: 2000
    });

    // 2秒后跳转
    setTimeout(function () {
      var pages = getCurrentPages();
      // 如果页面栈中已有 target 页，返回
      var venueId = that.data.venueId;
      var targetUrl;

      if (venueId) {
        // 有 venue_id → 跳转签到页
        targetUrl = '/pages/checkin/checkin?venue_id=' + encodeURIComponent(venueId);
        // 尝试检查签到页是否存在
        wx.navigateTo({ url: targetUrl, fail: function () {
          // 签到页不存在，走 redirect
          wx.redirectTo({ url: targetUrl, fail: function () {
            // 无论如何，兜底到首页
            wx.switchTab({ url: '/pages/index/index' });
          }});
        }});
      } else {
        // 无 venue_id → 返回首页（Tab 页用 switchTab）
        wx.switchTab({ url: '/pages/index/index' });
      }

      // 刷新本地数据（静默更新）
      that.fetchUserInfo();
      that.fetchPackageList();
    }, 2000);
  },

  /**
   * 点击底部邀请助力
   */
  onInviteFriend: function () {
    wx.navigateTo({ url: '/pages/help/help' });
  },

  /**
   * 空函数，阻止弹窗点击穿透
   */
  noop: function () {},

  onShareAppMessage: function () {
    return {
      title: '🏁 参赛包限时抢购！机器狗迷宫竞速等你来战',
      path: '/pages/packages/packages',
      imageUrl: '/assets/images/share-package.png'
    };
  }
});
