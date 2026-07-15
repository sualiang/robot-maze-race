// pages/edit-profile/edit-profile.js — 完善个人信息（深色主题 + 微信原生组件）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    avatar: '',
    avatarBase64: '',
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

  // ===== 微信原生 chooseAvatar 回调 =====
  onChooseAvatar: function (e) {
    var that = this;
    var avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    that.setData({ avatar: avatarUrl });
    wx.getFileSystemManager().readFile({
      filePath: avatarUrl,
      encoding: 'base64',
      success: function (fsRes) {
        that.setData({ avatarBase64: 'data:image/jpeg;base64,' + fsRes.data });
      }
    });
  },

  // ===== 昵称输入（微信原生 type="nickname"） =====
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

    // 有新头像 base64 → 先上传
    if (this.data.avatarBase64) {
      request.post('/auth/upload-avatar', { image: this.data.avatarBase64 }).then(function (res) {
        if (res && res.url) {
          data.avatarUrl = 'https://dog.amberrobot.com.cn' + res.url;
        }
        doSave();
      }).catch(function () {
        doSave();
      });
    } else {
      doSave();
    }
  }
});
