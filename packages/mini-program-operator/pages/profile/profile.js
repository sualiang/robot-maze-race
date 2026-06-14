// pages/profile/profile.js - 运营商信息管理
var request = require('../../utils/request');
var storage = require('../../utils/storage');

Page({
  data: {
    isLoggedIn: false,
    phone: '',
    password: '',
    showLoginForm: false,

    // 运营商信息
    avatar: '',
    nickname: '',
    operatorName: '',
    operatorPhone: '',

    // 场馆列表
    venues: [],
    currentVenueId: '',
    currentVenueName: '',
    showVenuePicker: false,

    // 设置表单
    showSettings: false,
    editVenueName: '',
    editVenueAddress: '',
    editMazeConfig: '',
    saving: false
  },

  onLoad: function () {
    this.checkLoginState();
  },

  onShow: function () {
    this.checkLoginState();
    if (this.data.isLoggedIn) {
      this.loadProfile();
    }
  },

  checkLoginState: function () {
    var app = getApp();
    var isLoggedIn = app.globalData.isLoggedIn;
    var user = app.globalData.userInfo || {};

    this.setData({
      isLoggedIn: isLoggedIn,
      showLoginForm: !isLoggedIn,
      currentVenueId: app.globalData.venueId || '',
      currentVenueName: app.globalData.venueName || '',
      operatorName: user.name || user.nickname || '',
      operatorPhone: user.phone || '',
      avatar: user.avatar || '',
      nickname: user.nickname || user.name || ''
    });
  },

  loadProfile: function () {
    var that = this;
    var app = getApp();

    request.silentGet('/operator/profile').then(function (data) {
      var user = data.user || data;
      app.globalData.userInfo = user;
      storage.setSync(storage.STORAGE_KEYS.USER, user);

      that.setData({
        avatar: user.avatar || '',
        nickname: user.nickname || user.name || '',
        operatorName: user.name || user.nickname || '',
        operatorPhone: user.phone || ''
      });
    }).catch(function (err) {
      console.error('获取运营商信息失败', err);
    });

    // 获取管理的场馆列表
    request.silentGet('/operator/venues').then(function (data) {
      var venues = data.list || data.venues || [];
      that.setData({ venues: venues });

      // 如果列表不为空且没选场馆，选第一个
      if (venues.length > 0 && !that.data.currentVenueId) {
        var first = venues[0];
        app.setVenue(first.id, first.name);
        that.setData({
          currentVenueId: first.id,
          currentVenueName: first.name
        });
      }
    }).catch(function (err) {
      console.error('获取场馆列表失败', err);
    });

    // 加载当前场馆设置
    this.loadVenueSettings();
  },

  loadVenueSettings: function () {
    var that = this;
    var app = getApp();
    var venueId = app.globalData.venueId;
    if (!venueId) return;

    request.silentGet('/operator/venue/' + venueId).then(function (data) {
      var venue = data.venue || data;
      that.setData({
        editVenueName: venue.name || '',
        editVenueAddress: venue.address || '',
        editMazeConfig: venue.mazeConfig || ''
      });
    }).catch(function (err) {
      console.error('获取场馆配置失败', err);
    });
  },

  // ===== 登录 =====
  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value });
  },

  handleLogin: function () {
    var that = this;
    var phone = that.data.phone.trim();
    var password = that.data.password;

    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中...' });

    getApp().login(phone, password).then(function () {
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      that.setData({
        isLoggedIn: true,
        showLoginForm: false,
        operatorPhone: phone
      });
      that.loadProfile();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({
        title: (err && err.message) || '登录失败',
        icon: 'none'
      });
    });
  },

  // ===== 退出登录 =====
  handleLogout: function () {
    var that = this;
    wx.showModal({
      title: '退出登录',
      content: '确认退出登录？',
      success: function (res) {
        if (res.confirm) {
          getApp().logout();
          that.setData({
            isLoggedIn: false,
            showLoginForm: true,
            avatar: '',
            nickname: '',
            operatorName: '',
            operatorPhone: '',
            venues: [],
            currentVenueId: '',
            currentVenueName: '',
            showSettings: false
          });
          wx.showToast({ title: '已退出', icon: 'none' });
        }
      }
    });
  },

  // ===== 场馆切换 =====
  toggleVenuePicker: function () {
    this.setData({ showVenuePicker: !this.data.showVenuePicker });
  },

  selectVenue: function (e) {
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    var app = getApp();

    app.setVenue(id, name);
    this.setData({
      currentVenueId: id,
      currentVenueName: name,
      showVenuePicker: false
    });

    wx.showToast({ title: '已切换到 ' + name, icon: 'success' });
    this.loadVenueSettings();
  },

  // ===== 设置 =====
  toggleSettings: function () {
    this.setData({ showSettings: !this.data.showSettings });
    if (!this.data.showSettings) {
      this.loadVenueSettings();
    }
  },

  onVenueNameInput: function (e) {
    this.setData({ editVenueName: e.detail.value });
  },

  onVenueAddressInput: function (e) {
    this.setData({ editVenueAddress: e.detail.value });
  },

  onMazeConfigInput: function (e) {
    this.setData({ editMazeConfig: e.detail.value });
  },

  saveSettings: function () {
    var that = this;
    var app = getApp();
    var venueId = app.globalData.venueId;

    if (!venueId) {
      wx.showToast({ title: '请先选择场馆', icon: 'none' });
      return;
    }

    var name = that.data.editVenueName.trim();
    if (!name) {
      wx.showToast({ title: '场馆名称不能为空', icon: 'none' });
      return;
    }

    that.setData({ saving: true });

    request.put('/operator/venue/' + venueId, {
      name: name,
      address: that.data.editVenueAddress.trim(),
      mazeConfig: that.data.editMazeConfig.trim()
    }).then(function () {
      that.setData({
        saving: false,
        showSettings: false,
        currentVenueName: name
      });
      app.globalData.venueName = name;
      wx.showToast({ title: '保存成功', icon: 'success' });
    }).catch(function (err) {
      that.setData({ saving: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    });
  },

  // 选择地址
  chooseAddress: function () {
    var that = this;
    wx.chooseLocation({
      success: function (res) {
        that.setData({
          editVenueAddress: res.address || res.name || ''
        });
      },
      fail: function () {
        // 用户取消
      }
    });
  }
});
