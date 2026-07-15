// 个人中心 — 未登录显示 CTA，已登录显示完整信息
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var app = getApp();

Page({
  data: {
    isLoggedIn: false,
    userInfo: {},

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
      deductible: 0,
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
      { key: 'coupon', icon: '🎫', label: '我的卡券', url: '/pages/coupon/coupon', rightText: '' },
      { key: 'exchange', icon: '🎁', label: '积分兑换', url: '/pages/points-shop/points-shop', rightText: '' },
    ]
  },

  onShow: function () {
    var token = wx.getStorageSync('player_token');
    if (!token) {
      app.globalData.isLoggedIn = false;
      app.globalData.token = null;
      app.globalData.userInfo = null;
      // 未登录直接跳微信登录页，跳过占位页
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

  // 去登录
  onGoLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  loadData: function () {
    var that = this;
    var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
    that.setData({ userInfo: user });

    request.silentGet('/player/me/profile').then(function (res) {
      if (res) {
        var profileData = res.code === 0 && res.data ? res.data : res;
        if (profileData.avatarUrl && !profileData.avatar_url) {
          profileData.avatar_url = profileData.avatarUrl;
        }
        if (profileData.raceCount && !profileData.race_count) {
          profileData.race_count = profileData.raceCount;
        }
        var merged = Object.assign({}, that.data.userInfo, profileData);
        that.setData({ userInfo: merged });
        storage.setSync(storage.STORAGE_KEYS.USER, merged);
      }
    }).catch(function () {});

    request.silentGet('/player/me/profile-check').then(function (res) {
      var d = res.data || res;
      var balance = d.pointsBalance || 0;
      that.setData({
        assets: {
          deductible: (d.availableDeductionCents || 0) / 100,
          couponCount: 0,
          couponTotal: d.couponTotalYuan || 0
        },
        'menuList[2].rightText': '当前' + balance + '积分',
        'userInfo.points': balance
      });
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

  onDeductTap: function () {
    wx.navigateTo({ url: '/pages/coupon/coupon?tab=0' });
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
