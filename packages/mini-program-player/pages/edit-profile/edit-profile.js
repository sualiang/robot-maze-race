// pages/edit-profile/edit-profile.js — 完善个人信息（深色主题 + 传统选择）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    avatar: '',
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
      avatar: user.avatar_url || '',
      nickname: user.nickname || '',
      gender: g,
      genderIndex: idx,
      phone: user.phone || ''
    });
  },

  // ===== 选择头像（button open-type=chooseAvatar + uploadFile） =====
  onChooseAvatar: function (e) {
    var that = this;
    var tempPath = e.detail.avatarUrl;
    that.setData({ avatar: tempPath });
    
    // 上传头像到服务器
    var token = wx.getStorageSync('player_token');
    wx.uploadFile({
      url: (request.getBaseUrl ? request.getBaseUrl() : 'https://dog.amberrobot.com.cn/api/v1') + '/auth/upload-avatar',
      filePath: tempPath,
      name: 'file',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        var data = JSON.parse(res.data);
        if (data.code === 0 && data.url) {
          var fullUrl = 'https://dog.amberrobot.com.cn' + data.url;
          that.setData({ avatar: fullUrl });
          // 更新全局状态
          var app = getApp();
          var user = app.globalData.userInfo || {};
          user.avatar_url = fullUrl;
          app.globalData.userInfo = user;
        }
      }
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

    function doSave() {
      request.post('/player/me/profile', data).then(function () {
        wx.hideLoading();
        var app = getApp();
        var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
        var merged = Object.assign({}, user, data);
        if (that.data.avatar) merged.avatar_url = that.data.avatar;
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

    // 头像已在 chooseAvatar 时即时上传，这里只需写入 avatarUrl
    if (that.data.avatar && that.data.avatar.indexOf('http') === 0) {
      data.avatar_url = that.data.avatar;
    }
    doSave();
  }
});
