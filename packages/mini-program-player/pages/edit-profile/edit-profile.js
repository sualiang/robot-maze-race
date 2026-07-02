// pages/edit-profile/edit-profile.js - 编辑个人信息（微信原生组件）
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var app = getApp();

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
    var user = app.globalData.userInfo || {};
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

    that.setData({
      avatar: avatarUrl
    });

    // 读取 base64 用于上传
    wx.getFileSystemManager().readFile({
      filePath: avatarUrl,
      encoding: 'base64',
      success: function (fsRes) {
        that.setData({
          avatarBase64: 'data:image/jpeg;base64,' + fsRes.data
        });
      },
      fail: function () {
        // 读取失败时保留原路径
        that.setData({ avatar: avatarUrl });
      }
    });

    wx.showToast({ title: '头像已选择', icon: 'success', duration: 1000 });
  },

  // ===== 微信原生 getPhoneNumber 回调 =====
  onGetPhoneNumber: function (e) {
    var that = this;
    var detail = e.detail;

    // 用户拒绝授权
    if (detail.errMsg && detail.errMsg.indexOf('deny') !== -1) {
      return;
    }

    // 新版获取手机号：直接拿 code，后端用 code 换手机号
    if (!detail.code) {
      wx.showToast({ title: '获取手机号失败', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '获取中...', mask: true });
    request.post('/auth/decrypt-phone', {
      code: detail.code
    }).then(function (d) {
      wx.hideLoading();
      var phone = (d && d.phone) || '';
      if (phone) {
        that.setData({ phone: phone });
        wx.showToast({ title: '手机号已获取', icon: 'success', duration: 1000 });
      } else {
        wx.showToast({ title: '解密手机号失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      var msg = (err && err.message) || '获取手机号失败';
      wx.showToast({ title: msg, icon: 'none' });
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
    if (this.data.phone) data.phone = this.data.phone;

    wx.showLoading({ title: '保存中...', mask: true });

    function doSave() {
      request.post('/player/me/profile', data).then(function () {
        wx.hideLoading();

        var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
        var merged = Object.assign({}, user, data);
        if (that.data.avatar) merged.avatar_url = that.data.avatar;
        storage.setSync(storage.STORAGE_KEYS.USER, merged);
        app.globalData.userInfo = merged;

        wx.showToast({ title: '保存成功', icon: 'success', duration: 1500 });
        setTimeout(function () {
          wx.navigateBack();
        }, 1500);
      }).catch(function (err) {
        wx.hideLoading();
        var msg = (err && err.message) || '保存失败';
        wx.showToast({ title: msg, icon: 'none', duration: 2000 });
      });
    }

    // 有头像 base64 数据，先上传
    if (this.data.avatarBase64) {
      request.post('/auth/upload-avatar', { image: this.data.avatarBase64 }).then(function (res) {
        if (res && res.url) {
          // 后端返回相对路径 /uploads/xxx.jpg，拼完整 URL 存库
          data.avatarUrl = 'https://amberrobot.com.cn' + res.url;
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
