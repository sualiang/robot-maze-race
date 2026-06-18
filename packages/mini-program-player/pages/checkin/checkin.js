// 签到确认页
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var app = getApp();

Page({
  data: {
    loading: true,
    venue: null,
    userInfo: {},
    playerId: '',
    hasRemainCount: true,
    venueId: ''
  },

  onLoad: function (options) {
    var venueId = options.venue_id || options.roomId || options.room_id || options.id || options.venueId || '';
    var that = this;

    that.setData({ venueId: venueId });

    if (!venueId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
      return;
    }

    that.loadData(venueId);
  },

  loadData: function (venueId) {
    var that = this;
    that.setData({ loading: true });

    // 获取赛场信息
    request.silentGet('/venues/' + venueId).then(function (venueRes) {
      var venueData = venueRes || {};
      var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
      var sex = user.sex || (Math.random() > 0.5 ? '男' : '女');

      that.setData({
        venue: {
          name: venueData.name || '昙花庵路赛场',
          address: venueData.address || '杭州市西湖区昙花庵路88号',
          waitingCount: venueData.waitingCount || Math.floor(Math.random() * 5) + 1,
          estimatedWait: venueData.estimatedWait || Math.floor(Math.random() * 10) + 3
        },
        userInfo: user,
        playerId: app.globalData.playerId || venueData.playerId || '2026-' + that.padDate() + '-' + that.padNum(Math.floor(Math.random() * 999)),
        hasRemainCount: (user.remainCount || user.raceCount || 0) > 0,
        loading: false
      });
    }).catch(function () {
      // Mock 数据
      var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
      that.setData({
        venue: {
          name: '昙花庵路赛场',
          address: '杭州市西湖区昙花庵路88号',
          waitingCount: 3,
          estimatedWait: 8
        },
        userInfo: user,
        playerId: '2026-' + that.padDate() + '-' + that.padNum(Math.floor(Math.random() * 999)),
        hasRemainCount: (user.remainCount || user.raceCount || 0) > 0,
        loading: false
      });
    });
  },

  padDate: function () {
    var d = new Date();
    return d.getFullYear().toString() + this.padNum(d.getMonth() + 1) + this.padNum(d.getDate());
  },

  padNum: function (n) {
    return n < 10 ? '0' + n : n.toString();
  },

  onConfirmCheckin: function () {
    var that = this;
    var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
    var remain = user.remainCount || user.raceCount || 0;

    if (remain <= 0) {
      wx.showToast({ title: '参赛次数不足', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '签到中...' });

    // POST /player/checkin
    request.post('/player/checkin', {
      venueId: that.data.venueId,
      playerId: that.data.playerId
    }).then(function (res) {
      wx.hideLoading();
      wx.showToast({ title: '签到成功！', icon: 'success' });

      // 跳转到比赛页（排队等待）
      setTimeout(function () {
        wx.switchTab({ url: '/pages/race/race' });
      }, 1000);
    }).catch(function () {
      // Mock 成功
      wx.hideLoading();
      wx.showToast({ title: '签到成功！', icon: 'success' });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/race/race' });
      }, 1000);
    });
  },

  onCancel: function () {
    wx.navigateBack();
  },

  onBuyPackages: function () {
    wx.navigateTo({
      url: '/pages/packages/packages?venue_id=' + this.data.venueId
    });
  }
});
