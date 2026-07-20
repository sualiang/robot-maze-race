// 积分商城
var request = require('../../utils/request');

Page({
  data: {
    userPoints: 0,
    entryItems: [],
    couponItems: [],
    showConfirm: false,
    targetItem: null,
    exchanging: false,
    toastMsg: '',
    showRecords: false,
    records: [],
    recordMonthFilter: ''
  },

  onLoad: function () {
    this.fetchItems();
  },

  onShow: function () {
    // 从兑换页返回时刷新积分
    this.fetchItems();
  },

  fetchItems: function () {
    var that = this;
    request.silentGet('/points-shop/items').then(function (res) {
      if (res) {
        var items = res.items || [];
        var userPoints = res.userPoints || 0;
        that.setData({
          userPoints: userPoints,
          entryItems: items.filter(function (i) { return i.itemType === 'entry_deduction'; }),
          couponItems: items.filter(function (i) { return i.itemType === 'merchant_coupon' || i.itemType === 'physical_gift'; })
        });
      }
    }).catch(function () {
      that.showToast('加载失败，请下拉重试');
    });
  },

  onExchange: function (e) {
    var id = e.currentTarget.dataset.id;
    var allItems = this.data.entryItems.concat(this.data.couponItems);
    var item = null;
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].id === id) { item = allItems[i]; break; }
    }
    if (!item) return;
    if (this.data.userPoints < item.needPoints) {
      this.showToast('积分不足');
      return;
    }
    this.setData({
      showConfirm: true,
      targetItem: item
    });
  },

  onConfirmExchange: function () {
    var that = this;
    var item = this.data.targetItem;
    if (!item) return;
    this.setData({ exchanging: true });

    request.post('/points-shop/exchange', { itemId: item.id }).then(function (res) {
      that.setData({ exchanging: false, showConfirm: false, targetItem: null });
      if (res && res.code === 0) {
        that.showToast('兑换成功！');
        that.fetchItems(); // 刷新积分和商品列表
      } else {
        that.showToast(res && res.message || '兑换失败');
      }
    }).catch(function () {
      that.setData({ exchanging: false, showConfirm: false, targetItem: null });
      that.showToast('兑换失败，请重试');
    });
  },

  onCloseConfirm: function () {
    this.setData({ showConfirm: false, targetItem: null });
  },

  onShowRecords: function () {
    this.setData({ showRecords: true });
    this.fetchRecords();
  },

  onCloseRecords: function () {
    this.setData({ showRecords: false });
  },

  onFilterMonth: function (e) {
    this.setData({ recordMonthFilter: e.detail.value });
    this.fetchRecords();
  },

  fetchRecords: function () {
    var that = this;
    var params = {};
    if (that.data.recordMonthFilter) {
      params.month = that.data.recordMonthFilter;
    }
    request.silentGet('/points-shop/records', params).then(function (res) {
      if (res) {
        that.setData({ records: res.records || res.data || [] });
      }
    }).catch(function () {
      that.setData({ records: [] });
    });
  },

  showToast: function (msg) {
    var that = this;
    this.setData({ toastMsg: msg });
    setTimeout(function () {
      that.setData({ toastMsg: '' });
    }, 2000);
  }
});
