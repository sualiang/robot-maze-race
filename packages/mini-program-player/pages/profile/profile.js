// 个人中心 V2.0 - 改版
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var app = getApp();

Page({
  data: {
    userInfo: {},
    seasonClosed: false,
    medal: {
      icon: '🎖️',
      name: '青铜勋章',
      currentExp: 0,
      nextLevelExp: 100
    },
    expPercent: 0,
    combatInfo: {
      combatPower: '--',
      rank: '--'
    },
    coreStats: {
      totalRaces: 0,
      bestRank: '-',
      perseveranceBonus: 0
    }
  },

  onShow: function () {
    this.loadData();
  },

  onPullDownRefresh: function () {
    this.loadData();
  },

  loadData: function () {
    var that = this;

    // 从缓存获取基本信息
    var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
    that.setData({ userInfo: user });

    // 拉取用户基本信息
    request.silentGet('/player/me/profile-check').then(function (res) {
      if (res) {
        var merged = Object.assign({}, that.data.userInfo, res);
        that.setData({ userInfo: merged });
        storage.setSync(storage.STORAGE_KEYS.USER, merged);
      }
    }).catch(function () {
      // 静默失败
    });

    // 拉取赛季数据
    request.silentGet('/season/user/info').then(function (res) {
      if (res) {
        var medal = res.medal || {};
        var expPercent = 0;
        var currentExp = medal.currentExp || 0;
        var nextLevelExp = medal.nextLevelExp || 100;
        if (nextLevelExp > 0) {
          expPercent = Math.min(100, Math.round((currentExp / nextLevelExp) * 100));
        }
        that.setData({
          medal: {
            icon: medal.icon || '🎖️',
            name: medal.name || '青铜勋章',
            currentExp: currentExp,
            nextLevelExp: nextLevelExp
          },
          expPercent: expPercent,
          combatInfo: {
            combatPower: res.combatPower || res.combat_power || '--',
            rank: res.rank || '--'
          },
          coreStats: {
            totalRaces: res.totalRaces || res.total_races || 0,
            bestRank: res.bestRank || res.best_rank || '-',
            perseveranceBonus: res.perseveranceBonus || res.perseverance_bonus || 0
          },
          'userInfo.points': res.points || res.points_balance || 0
        });
      }
    }).catch(function (err) {
      // 403 = 赛季未开启
      if (err && err.code === 403) {
        that.setData({ seasonClosed: true });
      }
    });

    wx.stopPullDownRefresh();
  },

  onNavigate: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url: url });
    }
  },

  onEditProfile: function () {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
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
          wx.redirectTo({ url: '/pages/login/login' });
        }
      }
    });
  }
});
