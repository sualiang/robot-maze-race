// pages/dashboard/dashboard.js - 场馆概览
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    venueName: '',
    venueAddress: '',
    venueStatus: 'open',
    venueStatusText: '营业中',
    venueStatusClass: 'status-open',
    todayPlayers: 0,
    todayPlayersText: '0',
    completionRate: 0,
    completionRateText: '0%',
    avgScore: 0,
    avgScoreText: '0.00s',
    isLoggedIn: false,
    loading: true,
    showLogin: true
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
    if (this.data.isLoggedIn) {
      this.fetchDashboard();
    }
  },

  onPullDownRefresh: function () {
    var that = this;
    that.fetchDashboard().then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  checkLogin: function () {
    var app = getApp();
    var isLoggedIn = app.globalData.isLoggedIn;
    this.setData({
      isLoggedIn: isLoggedIn,
      showLogin: !isLoggedIn
    });
    if (isLoggedIn) {
      this.setData({
        venueName: app.globalData.venueName || this.data.venueName
      });
    }
  },

  fetchDashboard: function () {
    var that = this;
    var app = getApp();
    var venueId = app.globalData.venueId;

    that.setData({ loading: true });

    request.get('/operator/dashboard', { venueId: venueId })
      .then(function (data) {
        var venue = data.venue || {};
        var stats = data.stats || {};
        var isOpen = venue.status === 'open';

        // 计算完成率百分比文本
        var rate = stats.completionRate || 0;
        var rateText = (rate * 100).toFixed(1) + '%';

        // 计算平均成绩文本
        var avg = stats.avgScore || 0;
        var avgText = avg.toFixed(2) + 's';

        // 参赛人数文本
        var playerCount = stats.todayPlayers || 0;
        var playerText = String(playerCount);

        that.setData({
          venueName: venue.name || app.globalData.venueName || '未设置场馆',
          venueAddress: venue.address || '未设置地址',
          venueStatus: isOpen ? 'open' : 'closed',
          venueStatusText: isOpen ? '营业中' : '已关闭',
          venueStatusClass: isOpen ? 'status-open' : 'status-closed',
          todayPlayers: playerCount,
          todayPlayersText: playerText,
          completionRate: rate,
          completionRateText: rateText,
          avgScore: avg,
          avgScoreText: avgText,
          loading: false
        });

        app.globalData.venueName = venue.name || app.globalData.venueName;
      })
      .catch(function (err) {
        console.error('获取仪表盘数据失败', err);
        that.setData({ loading: false });
      });
  },

  // 扫码核销参赛次数
  handleScan: function () {
    var that = this;
    wx.scanCode({
      scanType: ['qrCode', 'barCode'],
      success: function (res) {
        var code = res.result;
        that.verifyCode(code);
      },
      fail: function (err) {
        console.error('扫码失败', err);
        wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
      }
    });
  },

  verifyCode: function (code) {
    var that = this;
    wx.showLoading({ title: '核销中...' });

    request.post('/operator/verify', {
      code: code,
      venueId: getApp().globalData.venueId
    }).then(function (data) {
      wx.hideLoading();
      wx.showToast({ title: '核销成功！', icon: 'success' });
      // 刷新数据
      that.fetchDashboard();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showModal({
        title: '核销失败',
        content: (err && err.message) || '无法核销该码，请确认选手二维码有效',
        showCancel: false
      });
    });
  },

  // 切换开关馆状态
  toggleVenueStatus: function () {
    var that = this;
    var isOpen = that.data.venueStatus === 'open';
    var newStatus = isOpen ? 'closed' : 'open';
    var title = isOpen ? '确认关闭场馆？' : '确认开放场馆？';
    var confirmText = isOpen ? '关闭' : '开放';
    var content = isOpen
      ? '关闭后，选手将无法在该场馆参赛'
      : '开放后，选手可以正常参赛';

    wx.showModal({
      title: title,
      content: content,
      confirmText: confirmText,
      confirmColor: isOpen ? '#ff4d4f' : '#52c41a',
      success: function (res) {
        if (res.confirm) {
          that.doUpdateStatus(newStatus);
        }
      }
    });
  },

  doUpdateStatus: function (newStatus) {
    var that = this;
    var app = getApp();

    request.put('/operator/venue/' + app.globalData.venueId + '/status', {
      status: newStatus
    }).then(function () {
      var isOpen = newStatus === 'open';
      that.setData({
        venueStatus: newStatus,
        venueStatusText: isOpen ? '营业中' : '已关闭',
        venueStatusClass: isOpen ? 'status-open' : 'status-closed'
      });
      wx.showToast({
        title: isOpen ? '场馆已开放' : '场馆已关闭',
        icon: 'success'
      });
    }).catch(function (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 登录
  handleLogin: function () {
    wx.navigateTo({ url: '/pages/profile/profile' });
  }
});
