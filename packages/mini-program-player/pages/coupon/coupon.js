// 我的卡包
var request = require('../../utils/request');

Page({
  data: {
    tabs: [
      { key: 'unused', label: '未使用' },
      { key: 'used', label: '已使用' },
      { key: 'expired', label: '已过期' }
    ],
    currentTab: 'unused',
    coupons: []
  },

  onLoad: function () {
    this.fetchCoupons();
  },

  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key, coupons: [] });
    this.fetchCoupons();
  },

  fetchCoupons: function () {
    var that = this;
    var statusMap = {
      'unused': 'unused',
      'used': 'used',
      'expired': 'expired'
    };

    request.get('/merchant/coupon/list', { status: statusMap[this.data.currentTab] }).then(function (res) {
      var list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && Array.isArray(res.list)) {
        list = res.list;
      } else if (res && Array.isArray(res.data)) {
        list = res.data;
      }
      that.setData({ coupons: list });
    }).catch(function () {
      that.setData({ coupons: [] });
    });
  },

  onNavigate: function (e) {
    var lat = parseFloat(e.currentTarget.dataset.lat);
    var lng = parseFloat(e.currentTarget.dataset.lng);
    var name = e.currentTarget.dataset.name || '商家';

    if (isNaN(lat) || isNaN(lng)) {
      wx.showToast({ title: '暂无门店地址', icon: 'none' });
      return;
    }

    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: name,
      scale: 15
    });
  }
});
