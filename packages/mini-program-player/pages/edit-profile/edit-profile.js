// pages/edit-profile/edit-profile.js — 完善个人信息（深色主题）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    nickname: '',
    gender: '',
    genderOptions: ['男', '女', '不显示'],
    genderIndex: 2,
    phone: ''
  },

  onLoad: function () {
    var app = getApp();
    var user = app.globalData.userInfo || storage.getSync(storage.STORAGE_KEYS.USER, {});
    var g = user.gender || '';
    var idx = g === 'male' ? 0 : (g === 'female' ? 1 : 2);
    this.setData({
      nickname: user.nickname || '',
      gender: g,
      genderIndex: idx,
      phone: user.phone || ''
    });
  },

  // ===== 昵称输入 =====
  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  // ===== 性别选择 =====
  onGenderChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['male', 'female', ''];
    this.setData({ gender: vals[idx], genderIndex: idx });
  },

  // ===== 保存资料 =====
  onSave: function () {
    var that = this;
    var data = {};

    if (this.data.nickname) data.nickname = this.data.nickname;
    data.gender = this.data.gender || '';

    wx.showLoading({ title: '保存中...', mask: true });

    request.post('/player/me/profile', data).then(function () {
      wx.hideLoading();
      var app = getApp();
      var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
      var merged = Object.assign({}, user, data);
      storage.setSync(storage.STORAGE_KEYS.USER, merged);
      app.globalData.userInfo = merged;

      wx.showToast({ title: '保存成功', icon: 'success', duration: 1500 });
      setTimeout(function () {
        wx.switchTab({ url: '/pages/profile/profile' });
      }, 1500);
    }).catch(function (err) {
      wx.hideLoading();
      var msg = (err && err.message) || '保存失败';
      wx.showToast({ title: msg, icon: 'none', duration: 2000 });
    });
  }
});
