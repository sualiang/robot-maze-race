// pages/orders/orders.js - 我的订单
console.log('==== ORDERS PAGE LOADED ====');
var request = require('../../utils/request');

Page({
  data: {
    orders: [],
    loaded: false,
    selectedMonth: '',
    monthLabel: '筛选月份',
    monthOptions: []
  },

  onLoad: function () {
    this.buildMonthOptions();
    this.fetchOrders();
  },

  onShow: function () {
    this.fetchOrders();
  },

  buildMonthOptions: function () {
    var now = new Date();
    var options = [{ label: '显示全部', value: '' }];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var y = d.getFullYear();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      options.push({ label: y + '年' + (d.getMonth() + 1) + '月', value: y + '-' + m });
    }
    this.setData({ monthOptions: options });
  },

  fetchOrders: function () {
    var that = this;
    var url = '/player/orders';
    var month = that.data.selectedMonth;
    if (month) {
      url += '?month=' + encodeURIComponent(month);
    }

    request.silentGet(url).then(function (data) {
      var list = (data && data.list) ? data.list : [];

      var mapped = list.map(function (o) {
        return {
          id: o.id,
          order_no: o.order_no,
          package_name: o.package_name || '参赛包',
          amount_cents: o.amount_cents || 0,
          amount_text: ((o.amount_cents || 0) / 100).toFixed(2),
          discount_cents: o.discount_cents || 0,
          points_deduction_cents: o.points_deduction_cents || 0,
          points_deduction_text: ((o.points_deduction_cents || 0) / 100).toFixed(2),
          has_points_deduction: (o.points_deduction_cents || 0) > 0,
          status: o.status || 'pending',
          paid_at: (o.paid_at || '').replace('T', ' ').substring(0, 19),
          created_at: (o.created_at || '').replace('T', ' ').substring(0, 19)
        };
      });

      that.setData({
        orders: mapped,
        loaded: true
      });
    }).catch(function () {
      that.setData({ loaded: true });
    });
  },

  onSelectMonth: function () {
    var that = this;
    var options = this.data.monthOptions;
    var labels = options.map(function (o) { return o.label; });

    wx.showActionSheet({
      itemList: labels,
      success: function (res) {
        var idx = res.tapIndex;
        var opt = options[idx];
        if (opt) {
          that.setData({
            selectedMonth: opt.value,
            monthLabel: opt.value || '筛选月份'
          });
          that.fetchOrders();
        }
      }
    });
  }
});
