// pages/index/index.js - 赛事首页
var request = require('../../utils/request');

Page({
  data: {
    raceCount: 0,
    totalPlayers: 0,
    totalPlayersText: '0',
    arenaName: '主赛场',
    arenaStatus: 'open',
    remainCount: 0,
    announcements: [],
    loading: true,
    isLoggedIn: false,
    userInfo: null
  },

  onLoad: function () {
    this.checkAuthState();
    this.fetchHomeData();
  },

  onShow: function () {
    this.checkAuthState();
    this.fetchHomeData();
  },

  onPullDownRefresh: function () {
    var that = this;
    that.fetchHomeData().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  checkAuthState: function () {
    var app = getApp();
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo
    });
  },

  fetchHomeData: function () {
    var that = this;
    that.setData({ loading: true });
    request.get('/player/home').then(function (data) {
      that.setData({
        raceCount: data.raceCount || 0,
        totalPlayers: data.totalPlayers || 0,
        totalPlayersText: data.totalPlayers >= 10000 ? (data.totalPlayers / 10000).toFixed(1) + '万' : String(data.totalPlayers || 0),
        arenaName: data.arenaName || '主赛场',
        arenaStatus: data.arenaStatus || 'closed',
        remainCount: data.remainCount || 0,
        announcements: data.announcements || [],
        loading: false
      });
    }).catch(function (err) {
      console.error('获取首页数据失败', err);
      that.setData({ loading: false });
    });
  },

  goToPackages: function () {
    wx.switchTab({ url: '/pages/packages/packages' });
  },

  goToCheckin: function () {
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    if (this.data.remainCount <= 0) {
      wx.showModal({
        title: '参赛次数不足',
        content: '你的参赛次数已用完，请购买参赛包或邀请好友助力获取免费次数',
        confirmText: '去购买',
        cancelText: '稍后再说',
        success: function (res) {
          if (res.confirm) wx.switchTab({ url: '/pages/packages/packages' });
        }
      });
      return;
    }
    wx.navigateTo({ url: '/pages/checkin/checkin' });
  },

  goToLeaderboard: function () {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  goToHelp: function () {
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/help/help' });
  },

  promptLogin: function () {
    var that = this;
    wx.showModal({
      title: '请先登录',
      content: '需要登录后才能使用此功能',
      confirmText: '去登录',
      success: function (res) {
        if (res.confirm) {
          getApp().wxLogin().then(function () {
            that.checkAuthState();
          });
        }
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: '机器狗迷宫竞速大赛，等你来战！',
      path: '/pages/index/index',
      imageUrl: '/assets/images/share-banner.png'
    };
  },

  onShareTimeline: function () {
    return {
      title: '机器狗迷宫竞速大赛 — 速度与智慧的较量！',
      query: '',
      imageUrl: '/assets/images/share-banner.png'
    };
  }
});
