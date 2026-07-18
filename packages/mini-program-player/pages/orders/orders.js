// pages/orders/orders.js - 我的订单
var request = require('../../utils/request');

Page({
  data: {
    orders: [],
    loaded: false
  },

  onLoad: function () {
    this.fetchOrders();
  },

  onShow: function () {
    this.fetchOrders();
  },

  fetchOrders: function () {
    var that = this;

    request.silentGet('/player/orders').then(function (data) {
      var list = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (data && data.list) {
        list = data.list;
      } else if (data && data.data && data.data.list) {
        list = data.data.list;
      }

      var mapped = list.map(function (o) {
        return {
          id: o.id,
          order_no: o.order_no,
          package_name: o.package_name || '参赛包',
          amount_cents: o.amount_cents || 0,
          amount_text: ((o.amount_cents || 0) / 100).toFixed(2),
          discount_cents: o.discount_cents || 0,
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
  }
});
