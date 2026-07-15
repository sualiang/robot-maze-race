// pages/help/assist/assist.js - 好友的助力落地页
var request = require('../../../utils/request');

Page({
  data: {
    helpId: '',
    inviterName: '',
    activity: null,
    loading: true,
    loadError: false,
    errorMessage: '',
    needLogin: false,
    canHelp: true,
    showSuccessModal: false,
    pendingAssist: false
  },

  onLoad: function (options) {
    var that = this;
    var helpId = options && options.help_id ? options.help_id : '';
    var inviter = options && options.inviter ? decodeURIComponent(options.inviter) : '';

    that.setData({
      helpId: helpId,
      inviterName: inviter
    });

    if (!helpId) {
      that.setData({
        loading: false,
        loadError: true,
        errorMessage: '助力链接无效'
      });
      return;
    }

    that.loadHelpInfo(helpId);
  },

  loadHelpInfo: function (helpId) {
    var that = this;
    that.setData({ loading: true, loadError: false, errorMessage: '' });

    request.get('/player/help/detail', { helpId: helpId }).then(function (data) {
      if (!data || !data.activity) {
        that.setData({
          loading: false,
          loadError: true,
          errorMessage: '该助力活动不存在或已结束'
        });
        return;
      }

      var activity = data.activity;
      // 计算进度百分比
      activity.progressPercent = that.calcProgress(activity.currentHelpCount, activity.requiredHelpCount);

      that.setData({
        activity: activity,
        canHelp: data.canHelp !== false,
        needLogin: data.needLogin === true,
        loading: false
      });
    }).catch(function (err) {
      console.error('获取助力信息失败', err);
      var msg = (err && err.message) || '加载失败';
      that.setData({
        loading: false,
        loadError: true,
        errorMessage: msg
      });
    });
  },

  calcProgress: function (current, required) {
    if (!required || required <= 0) return 0;
    var pct = Math.round(current / required * 100);
    if (pct > 100) pct = 100;
    return pct;
  },

  // 点击「帮他助力」
  onAssist: function () {
    var that = this;

    if (that.data.pendingAssist) return;

    var app = getApp();
    if (!app.globalData.isLoggedIn) {
      // 未登录 → 跳登录页，登录后自动回跳
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
      wx.setStorageSync('assist_help_id', that.data.helpId);
      wx.setStorageSync('assist_inviter', that.data.inviterName);
      wx.navigateTo({
        url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/help/assist/assist?help_id=' + that.data.helpId + '&inviter=' + encodeURIComponent(that.data.inviterName))
      });
      return;
    }

    that.doAssist();
  },

  doAssist: function () {
    var that = this;
    if (that.data.pendingAssist) return;
    that.setData({ pendingAssist: true });

    wx.showLoading({ title: '助力中...' });

    request.post('/player/help/assist', {
      helpId: that.data.helpId
    }).then(function (res) {
      wx.hideLoading();
      that.setData({
        pendingAssist: false,
        showSuccessModal: true,
        canHelp: false
      });
      // 刷新活动信息
      that.loadHelpInfo(that.data.helpId);
    }).catch(function (err) {
      wx.hideLoading();
      that.setData({ pendingAssist: false });
      var msg = (err && err.message) || '助力失败，请稍后重试';
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    });
  },

  // 我也要发起助力
  onStartOwn: function () {
    var that = this;
    if (that.data.showSuccessModal) {
      that.setData({ showSuccessModal: false });
    }
    wx.navigateTo({
      url: '/pages/help/help'
    });
  },

  // 买参赛包
  onBuyPackage: function () {
    var that = this;
    that.setData({ showSuccessModal: false });
    wx.navigateTo({
      url: '/pages/packages/packages'
    });
  },

  // 关闭弹窗
  onCloseModal: function () {
    this.setData({ showSuccessModal: false });
  },

  // 重新加载
  onRetryLoad: function () {
    this.loadHelpInfo(this.data.helpId);
  },

  // 去登录
  onGoLogin: function () {
    var that = this;
    wx.setStorageSync('assist_help_id', that.data.helpId);
    wx.setStorageSync('assist_inviter', that.data.inviterName);
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/help/assist/assist?help_id=' + that.data.helpId + '&inviter=' + encodeURIComponent(that.data.inviterName))
    });
  },

  // 登录完成后自动回跳处理
  onShow: function () {
    var that = this;
    var app = getApp();
    var storedHelpId = wx.getStorageSync('assist_help_id');

    // 如果之前未登录保存了待助力ID，且现在已经登录了
    if (storedHelpId && app.globalData.isLoggedIn && that.data.needLogin) {
      wx.removeStorageSync('assist_help_id');
      wx.removeStorageSync('assist_inviter');
      // 重新加载并助力
      that.loadHelpInfo(that.data.helpId || storedHelpId);
    }
  },

  // 弹窗点击阻止冒泡
  onModalPrevent: function () {
    // do nothing, only prevent bubble
  },

  onShareAppMessage: function () {
    var that = this;
    var nickname = that.data.inviterName || '好友';
    return {
      title: nickname + '邀请你助力机器狗迷宫竞速！',
      path: '/pages/help/assist/assist?help_id=' + that.data.helpId + '&inviter=' + encodeURIComponent(nickname),
      imageUrl: ''
    };
  }
});
