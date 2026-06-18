// pages/index/index.js - 赛事首页
var request = require('../../utils/request');

Page({
  data: {
    remainCount: 0,
    packages: [],
    coupons: [],
    couponCount: 0,
    couponLoading: false,
    packageTab: 'packages',
    loading: true,
    isLoggedIn: false,
    userInfo: null
  },

  onLoad: function () {
    this.checkAuthState();
    this.fetchHomeData();
    this.fetchPackages();
  },

  onShow: function () {
    this.checkAuthState();
    this.fetchHomeData();
  },

  checkAuthState: function () {
    var app = getApp();
    var loggedIn = !!app.globalData.isLoggedIn;
    this.setData({
      isLoggedIn: loggedIn,
      userInfo: app.globalData.userInfo
    });
  },

  fetchHomeData: function () {
    var that = this;
    if (that.data.isLoggedIn) {
      request.get('/player/me/stats').then(function (stats) {
        if (stats && stats.raceCount !== undefined) {
          that.setData({ remainCount: stats.raceCount, couponCount: stats.couponCount || 0 });
        }
      }).catch(function () {});
    }
  },

  fetchPackages: function () {
    var that = this;
    request.get('/packages?status=active').then(function (data) {
      var list = [];
      if (data && data.list) list = data.list;
      else if (data && data.data && data.data.list) list = data.data.list;
      else if (Array.isArray(data)) list = data;
      var mapped = (list || []).map(function (p) {
        return {
          id: p.id,
          name: p.name,
          description: p.description || '',
          races: p.races || p.race_count || 0,
          price: p.price
        };
      });
      that.setData({ packages: mapped });
    }).catch(function (err) {
      console.error('获取参赛包失败', err);
    });
  },

  fetchCoupons: function () {
    var that = this;
    if (!that.data.isLoggedIn) return;
    that.setData({ couponLoading: true });
    request.get('/player/me/coupons').then(function (raw) {
      var list = Array.isArray(raw) ? raw : [];
      var mapped = list.map(function (c) {
        return {
          id: c.id,
          bonus_count: c.discount || 1,
          status: c.status || 'active',
          valid_until: c.expireAt || c.valid_until || c.validUntil
        };
      });
      that.setData({ coupons: mapped, couponCount: mapped.length, couponLoading: false });
    }).catch(function () {
      that.setData({ couponLoading: false });
    });
  },

  switchPackageTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ packageTab: tab });
    if (tab === 'coupons' && this.data.coupons.length === 0) {
      this.fetchCoupons();
    }
  },

  formatDate: function (str) {
    if (!str) return '长期';
    if (typeof str === 'number') {
      var d = new Date(str);
      return (d.getMonth() + 1) + '/' + d.getDate();
    }
    var d = new Date(str);
    if (isNaN(d.getTime())) return '长期';
    return (d.getMonth() + 1) + '/' + d.getDate();
  },

  useCoupon: function (e) {
    wx.showToast({ title: '暂未开放', icon: 'none' });
  },

  promptLogin: function () {
    var that = this;
    wx.showModal({
      title: '提示',
      content: '请先登录',
      cancelText: '稍后再说',
      success: function (res) {
        if (res.confirm) {
          var auth = require('../../utils/auth');
          auth.wxLogin().then(function () {
            that.checkAuthState();
          });
        }
      }
    });
  },

  goToCheckin: function () {
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/checkin/checkin' });
  },

  goToHelp: function () {
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/help/help' });
  },

  goToPackages: function () {
    wx.navigateTo({ url: '/pages/packages/packages' });
  },

  buyPackage: function () {
    wx.showToast({ title: '微信支付暂未开放', icon: 'none' });
  }
});
