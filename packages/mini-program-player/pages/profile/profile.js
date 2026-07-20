// 个人中心
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var app = getApp();

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},
    avatarSrc: '/assets/images/logo-avatar.png',

    seasonClosed: false,
    medalInfo: {
      level: 1,
      levelName: '青铜选手',
      currentExp: 0,
      nextLevelExp: 100,
      rank: 0,
      expPercent: 0,
      upgradeDesc: '升级白银立得：5元无门槛参赛抵价券 + 50积分'
    },

    assets: {
      couponCount: 0,
      couponTotal: 0
    },

    seasonStats: {
      totalRaces: 0,
      bestTime: '--',
      totalPoints: 0
    },

    menuList: [
      { key: 'order', icon: '📋', label: '我的订单', url: '/pages/orders/orders', rightText: '' },
    ]
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    var token = wx.getStorageSync('player_token');
    if (!token) {
      app.globalData.isLoggedIn = false;
      app.globalData.token = null;
      app.globalData.userInfo = null;
      wx.redirectTo({ url: '/pages/login/login?from=profile' });
      return;
    }
    app.globalData.isLoggedIn = true;
    app.globalData.token = token;
    this.setData({ isLoggedIn: true });
    this.loadData();
  },

  onPullDownRefresh: function () {
    if (app.globalData.isLoggedIn) {
      this.loadData();
    } else {
      wx.stopPullDownRefresh();
    }
  },

  loadData: function () {
    var that = this;
    var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
    var avatarUrl = user.avatar_url || user.avatarUrl || '';
    var avatarSrc = (avatarUrl && avatarUrl.indexOf('http://tmp') !== 0) ? avatarUrl : '/assets/images/logo-avatar.png';
    that.setData({ userInfo: user, avatarSrc: avatarSrc });

    request.silentGet('/player/me/profile-check').then(function (res) {
      if (res) {
        var d = res.code === 0 && res.data ? res.data : res;
        if (d.avatarUrl && !d.avatar_url) {
          d.avatar_url = d.avatarUrl;
        }
        if (d.raceCount && !d.race_count) {
          d.race_count = d.raceCount;
        }
        var merged = Object.assign({}, that.data.userInfo, d);
        var avUrl = merged.avatar_url || merged.avatarUrl || '';
        var avSrc = (avUrl && avUrl.indexOf('http://tmp') !== 0) ? avUrl : '/assets/images/logo-avatar.png';
        that.setData({ userInfo: merged, avatarSrc: avSrc });
        storage.setSync(storage.STORAGE_KEYS.USER, merged);

        var balance = d.pointsBalance || 0;
        that.setData({
          assets: {
            couponCount: 0,
            couponTotal: d.couponTotalYuan || 0
          },
          'userInfo.points': balance
        });
      }
    }).catch(function () {});

    request.silentGet('/season/user/info').then(function (res) {
      if (res) {
        var currentExp = res.exp || res.currentExp || res.current_exp || 0;
        var nextLevelExp = res.nextLevelExp || res.next_level_exp || 200;
        var expPercent = nextLevelExp > 0 ? Math.min(100, Math.round((currentExp / nextLevelExp) * 100)) : 0;
        that.setData({
          medalInfo: {
            level: res.level || 1,
            levelName: res.levelName || res.level_name || '青铜选手',
            currentExp: currentExp,
            nextLevelExp: nextLevelExp,
            rank: res.rank || res.rank_number || 0,
            expPercent: expPercent,
            upgradeDesc: res.upgradeDesc || res.upgrade_desc || '升级白银立得：5元无门槛参赛抵价券 + 50积分'
          },
        });
      }
    }).catch(function (err) {
      if (err && (err.code === 403 || err.statusCode === 403)) {
        that.setData({ seasonClosed: true });
      }
    });

    wx.stopPullDownRefresh();
  },

  onEditProfile: function () {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
  },

  onUpgrade: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onGoPointsShop: function () {
    wx.navigateTo({ url: '/pages/points-shop/points-shop' });
  },

  onCouponTap: function () {
    wx.navigateTo({ url: '/pages/coupon/coupon?tab=1' });
  },

  onMenuItemTap: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url: url });
    }
  },

  onLogout: function () {
    var that = this;
    wx.showModal({
      title: '退出登录',
      content: '确定退出登录吗？',
      success: function (res) {
        if (res.confirm) {
          var auth = require('../../utils/auth');
          auth.logout();
          wx.redirectTo({ url: '/pages/login/login?from=profile' });
        }
      }
    });
  }
});
