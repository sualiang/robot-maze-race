// pages/orders/orders.js - 我的订单
var request = require('../../utils/request');

/**
 * 日期格式化: ISO 8601 → yyyy-MM-dd HH:mm:ss
 */
function fmtDateTime(val) {
  if (!val) return '';
  var s = String(val);
  s = s.replace('T', ' ');
  if (s.length >= 19) s = s.substring(0, 19);
  return s;
}

Page({
  data: {
    orders: [],
    loaded: false,
    selectedMonth: '',
    monthOptions: []
  },

  onLoad: function () {
    this.fetchOrders();
  },

  onShow: function () {
    this.fetchOrders();
  },

  buildMonthOptions: function (availableMonths) {
    var options = [{ label: '全部', value: '' }];
    (availableMonths || []).forEach(function (m) {
      options.push({ label: m, value: m });
    });
    this.setData({ monthOptions: options });
  },

  onSelectMonth: function (e) {
    var month = e.currentTarget.dataset.month;
    this.setData({ selectedMonth: month });
    this.fetchOrders();
  },

  fetchOrders: function () {
    var that = this;
    var url = '/player/orders';
    var month = that.data.selectedMonth;
    if (month) {
      url += '?month=' + encodeURIComponent(month);
    }

    request.silentGet(url).then(function (data) {
      var list = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (data && data.list) {
        list = data.list;
      } else if (data && data.data && data.data.list) {
        list = data.data.list;
      }

      var mapped = list.map(function (o) {
        var status = o.status || 'pending';
        var statusMap = {
          'paid':      { text: '已支付', cls: 'status-paid' },
          'pending':   { text: '待支付', cls: 'status-pending' },
          'cancelled': { text: '已取消', cls: 'status-cancel' },
          'refunding': { text: '退款中', cls: 'status-pending' },
          'refunded':  { text: '已退款', cls: 'status-cancel' },
          'abnormal':  { text: '异常',   cls: 'status-pending' }
        };
        var sm = statusMap[status] || { text: '待支付', cls: 'status-pending' };

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
          status: status,
          statusText: sm.text,
          statusClass: sm.cls,
          paid_at: fmtDateTime(o.paid_at),
          created_at: fmtDateTime(o.created_at)
        };
      });

      that.setData({
        orders: mapped,
        loaded: true
      });

      // 根据 availableMonths 构建月份选项
      if (data && data.availableMonths && that.data.monthOptions.length === 0) {
        that.buildMonthOptions(data.availableMonths);
      }
    }).catch(function () {
      that.setData({ loaded: true });
    });
  }
});
