// pages/profile/profile.js - 个人中心
var request = require('../../utils/request');

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    raceCount: 0,
    helpCount: 0,
    couponCount: 0,
    showProfileEdit: false,
    showEditModal: false,
    editNickname: '',
    editPhone: '',
    editAvatar: '',
    editForm: {
      nickname: '',
      phone: '',
      avatarUrl: ''
    },
    raceRecords: [],
    helpActivities: [],
    coupons: [],
    activeTab: 'records',
    loading: false,
    recordsLoading: false,
    recordsEmpty: false,
    helpsLoading: false,
    helpsEmpty: false,
    couponsLoading: false,
    couponsEmpty: false,
    tabs: [
      { label: '参赛记录', key: 'records' },
      { label: '助力记录', key: 'help' },
      { label: '优惠券', key: 'coupons' }
    ],
    tabIndex: 0,
    stats: {
      totalRaces: 0,
      rankCount: 0
    }
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
  },

  checkLogin: function () {
    var app = getApp();
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo
    });
    if (app.globalData.isLoggedIn) {
      this.fetchUserStats();
    }
  },

  formatScore: function (score) {
    if (!score && score !== 0) return '-';
    if (score < 60) return parseFloat(score).toFixed(1) + 's';
    var m = Math.floor(score / 60);
    return m + 'm';
  },

  fetchUserStats: function () {
    var that = this;
    request.get('/player/me/stats').then(function (stats) {
      if (stats) {
        var bestScoreText = '0s';
        if (stats.bestScore) {
          bestScoreText = that.formatScore(stats.bestScore);
        }
        that.setData({
          raceCount: stats.raceCount || 0,
          helpCount: stats.helpCount || 0,
          couponCount: stats.couponCount || 0,
          bestScoreText: bestScoreText,
          'stats.totalRaces': stats.totalRaces || stats.raceCount || 0,
          'stats.rankCount': stats.rankCount || 0
        });
      }
    }).catch(function (err) {
      console.error('获取用户统计失败', err);
    });
  },

  doLogin: function () {
    var that = this;
    var app = getApp();
    app.wxLogin().then(function () {
      that.checkLogin();
    }).catch(function () {});
  },

  onTabChange: function (e) {
    var idx = parseInt(e.currentTarget.dataset.index);
    this.setData({ tabIndex: idx, activeTab: this.data.tabs[idx].key });
    var tab = this.data.tabs[idx].key;
    if (tab === 'records') this.fetchRaceRecords();
    else if (tab === 'help') this.fetchHelpActivities();
    else if (tab === 'coupons') this.fetchCoupons();
  },

  fetchRaceRecords: function () {
    var that = this;
    that.setData({ recordsLoading: true, recordsEmpty: false });
    request.get('/player/me/race-records').then(function (records) {
      var list = records || [];
      list.forEach(function (item) {
        if (item.bestTime < 60) {
          item.scoreText = parseFloat(item.bestTime).toFixed(1) + '秒';
        } else {
          var m = Math.floor(item.bestTime / 60);
          var s = (item.bestTime % 60).toFixed(1);
          item.scoreText = m + '分' + s + '秒';
        }
      });
      that.setData({ raceRecords: list, recordsLoading: false, recordsEmpty: list.length === 0 });
    }).catch(function (err) {
      console.error('获取参赛记录失败', err);
      that.setData({ recordsLoading: false });
    });
  },

  fetchHelpActivities: function () {
    var that = this;
    that.setData({ helpsLoading: true, helpsEmpty: false });
    request.get('/player/me/help-activities').then(function (activities) {
      var list = activities || [];
      that.setData({ helpActivities: list, helpsLoading: false, helpsEmpty: list.length === 0 });
    }).catch(function (err) {
      console.error('获取助力活动失败', err);
      that.setData({ helpsLoading: false });
    });
  },

  fetchCoupons: function () {
    var that = this;
    that.setData({ couponsLoading: true, couponsEmpty: false });
    request.get('/player/me/coupons').then(function (coupons) {
      var list = coupons || [];
      list.forEach(function (item) {
        if (item.type === 'cash') {
          item.couponValueText = '¥' + (item.value / 100).toFixed(0);
        } else {
          item.couponValueText = item.value + '折';
        }
        item.minAmountText = (item.minAmount / 100).toFixed(0);
      });
      that.setData({ coupons: list, couponsLoading: false, couponsEmpty: list.length === 0 });
    }).catch(function (err) {
      console.error('获取优惠券失败', err);
      that.setData({ couponsLoading: false });
    });
  },

  onEditProfile: function () {
    var userInfo = this.data.userInfo;
    this.setData({
      showEditModal: true,
      showProfileEdit: true,
      editNickname: userInfo ? (userInfo.nickname || '') : '',
      editPhone: userInfo ? (userInfo.phone || '') : '',
      editAvatar: userInfo ? (userInfo.avatarUrl || '') : '',
      'editForm.nickname': userInfo ? (userInfo.nickname || '') : '',
      'editForm.phone': userInfo ? (userInfo.phone || '') : '',
      'editForm.avatarUrl': userInfo ? (userInfo.avatarUrl || '') : ''
    });
  },

  onCancelEdit: function () {
    this.setData({ showProfileEdit: false, showEditModal: false });
  },

  onCloseEditModal: function () {
    this.setData({ showEditModal: false, showProfileEdit: false });
  },

  onNicknameInput: function (e) {
    this.setData({ editNickname: e.detail.value, 'editForm.nickname': e.detail.value });
  },

  onPhoneInput: function (e) {
    this.setData({ editPhone: e.detail.value, 'editForm.phone': e.detail.value });
  },

  onChooseAvatar: function (e) {
    var url = e.detail.avatarUrl;
    this.setData({ editAvatar: url, 'editForm.avatarUrl': url });
  },

  onSubmitProfile: function () {
    var that = this;
    var nickname = that.data.editNickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    that.setData({ loading: true });
    request.put('/player/me/profile', {
      nickname: nickname,
      phone: that.data.editPhone.trim(),
      avatarUrl: that.data.editAvatar
    }).then(function (updatedUser) {
      that.setData({ loading: false, showProfileEdit: false, showEditModal: false });
      var app = getApp();
      app.globalData.userInfo = updatedUser;
      wx.setStorageSync('player_user', updatedUser);
      that.setData({ userInfo: updatedUser });
      wx.showToast({ title: '保存成功', icon: 'success' });
    }).catch(function (err) {
      that.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  goToPackages: function () {
    wx.switchTab({ url: '/pages/packages/packages' });
  },

  goToHelp: function () {
    wx.navigateTo({ url: '/pages/help/help' });
  },

  goToLeaderboard: function () {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  formatTime: function (seconds) {
    if (!seconds && seconds !== 0) return '-';
    if (seconds < 60) return seconds.toFixed(1) + '秒';
    var m = Math.floor(seconds / 60);
    var s = (seconds % 60).toFixed(1);
    return m + '分' + s + '秒';
  },

  formatDate: function (ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    var M = d.getMonth() + 1;
    var D = d.getDate();
    return M + '月' + D + '日';
  },

  onShareAppMessage: function () {
    return { title: '快来帮我助力！', path: '/pages/index/index' };
  },

  onShareTimeline: function () {
    return { title: '快来帮我助力！' };
  },

  goToHelpDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/help/help?id=' + id
    });
  },

  doLogout: function () {
    var that = this;
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();
          app.globalData.isLoggedIn = false;
          app.globalData.userInfo = null;
          wx.removeStorageSync('player_token');
          wx.removeStorageSync('player_user');
          that.setData({
            isLoggedIn: false,
            userInfo: null,
            raceRecords: [],
            helpActivities: [],
            coupons: [],
            stats: { totalRaces: 0, rankCount: 0 },
            bestScoreText: '0s'
          });
        }
      }
    });
  },

  goToPackages: function () {
    wx.switchTab({ url: '/pages/packages/packages' });
  },

  goToHelp: function () {
    wx.navigateTo({ url: '/pages/help/help' });
  },

  goToLeaderboard: function () {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  }
});
