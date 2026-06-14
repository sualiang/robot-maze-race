// pages/checkin/checkin.js - 签到排队页
var request = require('../../utils/request');

Page({
  data: {
    checkinStatus: 'idle',
    queueInfo: null,
    checkinRecord: null,
    arenaInfo: null,
    checkinCode: '',
    errorMessage: '',
    userNickname: '',
    userAvatarUrl: '',
    userPhone: '',
    loading: false,
    needFillInfo: false
  },

  onLoad: function () {
    this.checkExistingCheckin();
  },

  checkExistingCheckin: function () {
    var that = this;
    request.silentGet('/player/checkin/current').then(function (record) {
      if (record) {
        that.setData({ checkinRecord: record, checkinStatus: record.status });
        if (record.status === 'queuing') that.fetchQueueStatus();
      }
    }).catch(function () {});
  },

  onScanCode: function () {
    var that = this;
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: function (res) {
        that.setData({ checkinCode: res.result });
        that.doCheckin(res.result);
      },
      fail: function (err) {
        if (err.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
        }
      }
    });
  },

  doCheckin: function (code) {
    var that = this;
    that.setData({ loading: true, errorMessage: '', checkinStatus: 'checking' });

    request.post('/player/checkin/validate', { code: code }).then(function (arena) {
      return request.silentGet('/player/me/profile-check').then(function (userInfo) {
        if (userInfo && userInfo.needPhone) {
          that.setData({ loading: false, needFillInfo: true, arenaInfo: arena });
          wx.showToast({ title: '请先完善个人信息', icon: 'none', duration: 2000 });
        } else {
          return that.submitCheckin(code);
        }
      });
    }).catch(function (err) {
      var msg = (err && err.message) || '签到失败，请重试';
      that.setData({ loading: false, checkinStatus: 'idle', errorMessage: msg });
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    });
  },

  submitProfileAndCheckin: function () {
    var that = this;
    var nickname = that.data.userNickname;
    var phone = that.data.userPhone;
    var avatarUrl = that.data.userAvatarUrl;
    var code = that.data.checkinCode;

    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    that.setData({ loading: true, needFillInfo: false });

    request.post('/player/me/profile', {
      nickname: nickname.trim(),
      phone: phone.trim(),
      avatarUrl: avatarUrl
    }).then(function () {
      return that.submitCheckin(code);
    }).catch(function (err) {
      that.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
    });
  },

  submitCheckin: function (code) {
    var that = this;
    return request.post('/player/checkin', { code: code }).then(function (record) {
      that.setData({ checkinRecord: record, checkinStatus: record.status, loading: false });
      if (record.status === 'queuing') that.fetchQueueStatus();
    });
  },

  fetchQueueStatus: function () {
    var that = this;
    request.get('/player/checkin/queue').then(function (queueInfo) {
      if (queueInfo && queueInfo.estimatedWaitTime != null) {
        var waitSec = queueInfo.estimatedWaitTime;
        if (waitSec >= 60) {
          var mins = Math.floor(waitSec / 60);
          var secs = waitSec % 60;
          queueInfo.waitTimeText = mins + '分' + secs + '秒';
        } else {
          queueInfo.waitTimeText = waitSec + '秒';
        }
      }
      that.setData({ queueInfo: queueInfo, checkinStatus: queueInfo.status });
    }).catch(function () {});
  },

  onRefreshQueue: function () {
    this.fetchQueueStatus();
  },

  onHide: function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  onUnload: function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
    }
  },

  onChooseAvatar: function (e) {
    this.setData({ userAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameInput: function (e) {
    this.setData({ userNickname: e.detail.value });
  },

  onPhoneInput: function (e) {
    this.setData({ userPhone: e.detail.value });
  },

  goToLeaderboard: function () {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  onShareAppMessage: function () {
    return {
      title: '我正在排队参加机器狗迷宫竞速！',
      path: '/pages/index/index'
    };
  }
});
