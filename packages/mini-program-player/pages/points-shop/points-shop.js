// 积分商城
var request = require('../../utils/request');

// 商品类型 → 角标映射
var TYPE_BADGE = {
  entry_deduction: { text: '参赛抵扣', color: '#e94560' },
  merchant_coupon: { text: '消费券', color: '#6c5ce7' },
  platform_coupon: { text: '平台券', color: '#0984e3' },
  physical_gift: { text: '实物礼品', color: '#e17055' }
};

function getBadge(itemType) {
  return TYPE_BADGE[itemType] || { text: '商品', color: '#888' };
}

Page({
  data: {
    userPoints: 0,
    items: [],
    // 兑换弹窗
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
        var items = (res.items || []).map(function (item) {
          var badge = getBadge(item.itemType);
          item._badgeText = badge.text;
          item._badgeColor = badge.color;
          return item;
        });
        that.setData({
          userPoints: res.userPoints || 0,
          items: items
        });
      }
    }).catch(function (e) {
      that.showToast('加载失败，请下拉重试');
    });
  },

  // ==== 商品卡片点击 ====
  onExchange: function (e) {
    var id = e.currentTarget.dataset.id;
    var items = this.data.items;
    var item = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { item = items[i]; break; }
    }
    if (!item) return;
    if (this.data.userPoints < item.needPoints) {
      this.showToast('积分不足');
      return;
    }

    // 实物礼品 → 打开详情浮层
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
      if (res && res.exchangeId) {
        var needPoints = (res.needPoints) || item.needPoints || 0;
        that.setData({
          showDetail: false,
          detailItem: null,
          showRedeem: false,
          redeemCodeInput: '',
          userPoints: Math.max(0, that.data.userPoints - needPoints)
        });
        wx.showToast({ title: '兑换成功！', icon: 'success', duration: 2000 });
        that.fetchItems();
        that.fetchRecords();
      } else {
        wx.showToast({ title: '核销失败', icon: 'none', duration: 2500 });
      }
    }).catch(function (err) {
      that.setData({ redeeming: false });
      var errMsg = (err && err.message) || '核销失败，请重试';
      wx.showToast({ title: errMsg, icon: 'none', duration: 2500 });
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