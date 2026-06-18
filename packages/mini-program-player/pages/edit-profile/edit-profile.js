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
    phone: '',
    phoneDisabled: false
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
      phone: user.phone || '',
      phoneDisabled: !!user.phone
    });
  },

  onAvatarTap: function () {
    var that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempPath = res.tempFilePaths[0];
        that.setData({ avatar: tempPath });
        wx.showToast({ title: '头像已选择', icon: 'success', duration: 1000 });

        // 压缩后读取 base64 用于上传
        wx.compressImage({
          src: tempPath,
          quality: 20,
          success: function (comp) {
            wx.getFileSystemManager().readFile({
              filePath: comp.tempFilePath,
              encoding: 'base64',
              success: function (fsRes) {
                that.setData({ avatarBase64: 'data:image/jpeg;base64,' + fsRes.data });
              },
              fail: function () { that.setData({ avatar: tempPath }); }
            });
          },
          fail: function () {
            // 压缩失败时降级：直接用原图转 base64
            wx.getFileSystemManager().readFile({
              filePath: tempPath,
              encoding: 'base64',
              success: function (fsRes) {
                that.setData({ avatarBase64: 'data:image/png;base64,' + fsRes.data });
              }
            });
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

  onGenderChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['male', 'female', ''];
    this.setData({ gender: vals[idx], genderIndex: idx });
  },

  onSave: function () {
    var that = this;
    var data = {};

    if (this.data.nickname) data.nickname = this.data.nickname;
    data.gender = this.data.gender || '';
    if (this.data.phone) data.phone = this.data.phone;
    if (this.data.avatarBase64) data.avatarUrl = this.data.avatarBase64;

    wx.showLoading({ title: '保存中...', mask: true });

    request.post('/player/me/profile', data).then(function () {
      wx.hideLoading();
      var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
      var merged = Object.assign({}, user, data);
      // 前端显示用本地路径（临时），不存 base64 到缓存
      if (that.data.avatar) merged.avatar_url = that.data.avatar;
      storage.setSync(storage.STORAGE_KEYS.USER, merged);
      app.globalData.userInfo = merged;

      wx.showToast({ title: '保存成功', icon: 'success', duration: 1500 });
      setTimeout(function () { wx.navigateBack(); }, 1500);
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none', duration: 2000 });
    });
  }
});
