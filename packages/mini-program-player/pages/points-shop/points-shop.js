// 积分商城
var request = require('../../utils/request');

Page({
  data: {
    userPoints: 0,
    entryItems: [],
    couponItems: [],
    // 老弹窗（抵扣卡/消费券）
    showConfirm: false,
    targetItem: null,
    exchanging: false,
    // 实物礼品详情浮层
    showDetail: false,
    detailItem: null,
    // 核销码输入浮层
    showRedeem: false,
    redeemCodeInput: '',
    redeeming: false,
    // 其他
    toastMsg: '',
    showRecords: false,
    records: [],
    recordMonthFilter: ''
  },

  onLoad: function () {
    this.fetchItems();
  },

  onShow: function () {
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
          couponItems: items.filter(function (i) {
            return i.itemType === 'merchant_coupon' || i.itemType === 'physical_gift';
          })
        });
      }
    }).catch(function (e) {
      that.showToast('加载失败，请下拉重试');
    });
  },

  // ==== 商品卡片点击 ====
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

    // physical_gift → 打开详情浮层
    if (item.itemType === 'physical_gift') {
      this.setData({ showDetail: true, detailItem: item });
      return;
    }

    // 其他类型 → 老弹窗
    this.setData({ showConfirm: true, targetItem: item });
  },

  // ==== 老弹窗（抵扣卡/消费券） ====
  onConfirmExchange: function () {
    var that = this;
    var item = this.data.targetItem;
    if (!item) return;
    this.setData({ exchanging: true });

    request.post('/points-shop/exchange', { itemId: item.id }).then(function (res) {
      that.setData({ exchanging: false, showConfirm: false, targetItem: null });
      if (res && res.code === 0) {
        that.showToast('兑换成功！');
        that.fetchItems();
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

  // ==== 实物礼品详情浮层 ====
  onCloseDetail: function () {
    this.setData({ showDetail: false, detailItem: null, showRedeem: false, redeemCodeInput: '' });
  },

  // "现场兑换"按钮 → 打开核销码输入浮层
  onStartRedeem: function () {
    this.setData({ showRedeem: true, redeemCodeInput: '' });
  },

  onCloseRedeem: function () {
    this.setData({ showRedeem: false, redeemCodeInput: '' });
  },

  onRedeemCodeInput: function (e) {
    // 限制4位数字
    var val = (e.detail.value || '').replace(/[^0-9]/g, '').slice(0, 4);
    this.setData({ redeemCodeInput: val });
  },

  // 核销兑换
  onConfirmRedeem: function () {
    var that = this;
    var item = this.data.detailItem;
    var code = this.data.redeemCodeInput;
    if (!item || code.length !== 4) return;

    this.setData({ redeeming: true });
    request.post('/points-shop/redeem', {
      itemId: item.id,
      redeemCode: code
    }).then(function (res) {
      that.setData({ redeeming: false });
      if (res && res.code === 0) {
        var needPoints = (res.data && res.data.needPoints) || item.needPoints || 0;
        that.setData({
          showDetail: false,
          detailItem: null,
          showRedeem: false,
          redeemCodeInput: '',
          userPoints: Math.max(0, that.data.userPoints - needPoints)
        });
        wx.showToast({ title: '🎉 恭喜你，积分兑换成功！', icon: 'success', duration: 2500 });
        that.fetchItems();
        that.fetchRecords();
      } else {
        var errMsg = (res && res.message) || '核销失败';
        console.error('[PointsShop] redeem failed:', res);
        wx.showToast({ title: errMsg, icon: 'none', duration: 2500 });
      }
    }).catch(function (err) {
      that.setData({ redeeming: false });
      console.error('[PointsShop] redeem catch:', err);
      wx.showToast({ title: '核销失败，请重试', icon: 'none', duration: 2500 });
    });
  },

  // ==== 兑换记录 ====
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
    request.silentGet('/points-shop/history', params).then(function (res) {
      if (res) {
        var d = res.data || res;
        that.setData({ records: d.list || d.records || [] });
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
    }, 3000);
  }
});
