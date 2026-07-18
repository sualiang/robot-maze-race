// pages/orders/orders.js - 我的订单
console.log('==== ORDERS PAGE LOADED ====');
var request = require('../../utils/request');

/**
 * 日期格式化: ISO 8601 → yyyy-MM-dd HH:mm:ss
 * 兜底处理: MySQL DATETIME / ISO 8601 两种格式
 */
function fmtDateTime(val) {
  if (!val) return '';
  var s = String(val);
  // 统一替换 T → 空格，取前19位 "yyyy-MM-dd HH:mm:ss"
  s = s.replace('T', ' ');
  if (s.length >= 19) s = s.substring(0, 19);
  return s;
}

Page({
  data: {
    orders: [],
    loaded: false,
    selectedMonth: '',
    monthLabel: '全部月份',
    monthOptions: [],
    pickerValue: ''
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
    }).catch(function () {
      that.setData({ loaded: true });
    });
  },

  onMonthChange: function (e) {
    var val = e.detail.value; // "YYYY-MM"
    if (!val) {
      this.setData({
        selectedMonth: '',
        monthLabel: '全部月份',
        pickerValue: ''
      });
    } else {
      var parts = val.split('-');
      var monthLabel = parts[0] + '年' + parseInt(parts[1], 10) + '月';
      this.setData({
        selectedMonth: val,
        monthLabel: monthLabel,
        pickerValue: val
      });
    }
    this.fetchOrders();
  }
});
