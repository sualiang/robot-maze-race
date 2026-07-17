// pages/register/register.js — 新用户注册（头像 + 昵称 + 手机号）
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    avatar: '',
    avatarBase64: '',
    nickname: '',
    phone: '',
    saving: false
  },

  onChooseAvatar: function () {
    var that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempPath = res.tempFilePaths[0];
        that.setData({ avatar: tempPath });
        wx.getFileSystemManager().readFile({
          filePath: tempPath,
          encoding: 'base64',
          success: function (fsRes) {
            that.setData({ avatarBase64: 'data:image/jpeg;base64,' + fsRes.data });
          }
        });
      }
    });
  },

  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  onSubmit: function () {
    var that = this;

    // 三个字段校验
    if (!that.data.nickname.trim()) {
      wx.showToast({ title: '请输入玩家昵称', icon: 'none' });
      return;
    }
    var phone = that.data.phone.trim();
    if (!phone || !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
      return;
    }

    that.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    var profileData = {
      nickname: that.data.nickname.trim(),
      phone: phone
    };

    function doSave() {
      request.post('/player/me/profile', profileData).then(function () {
        wx.hideLoading();
        that.setData({ saving: false });

        // 更新本地存储
        var app = getApp();
        var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
        var merged = Object.assign({}, user, profileData);
        if (that.data.avatar) merged.avatar_url = that.data.avatar;
        storage.setSync(storage.STORAGE_KEYS.USER, merged);
        app.globalData.userInfo = merged;

        wx.showToast({ title: '注册成功', icon: 'success', duration: 1500 });
        setTimeout(function () {
          // 同步运营商上下文
          app._syncOperatorContext();
          wx.switchTab({ url: '/pages/profile/profile' });
        }, 1500);
      }).catch(function (err) {
        wx.hideLoading();
        that.setData({ saving: false });
        var msg = (err && err.message) || '保存失败';
        wx.showToast({ title: msg, icon: 'none', duration: 2000 });
      });
    }

    // 上传头像
    if (that.data.avatarBase64) {
      request.post('/auth/upload-avatar', { image: that.data.avatarBase64 }).then(function (res) {
        if (res && res.url) {
          profileData.avatarUrl = 'https://dog.amberrobot.com.cn' + res.url;
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
