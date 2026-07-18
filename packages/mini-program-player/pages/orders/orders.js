// pages/orders/orders.js - 我的订单
var request = require('../../utils/request');

Page({
  data: {
    orders: [],
    loaded: false,
    selectedMonth: '',
    monthLabel: '筛选月份',
    showPicker: false,
    pickerValue: [0],
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
    var options = [{ label: '全部', value: '' }];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var y = d.getFullYear();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      options.push({ label: y + '-' + m, value: y + '-' + m });
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
      var list = [];
      if (Array.isArray(data)) {
        list = data;
      } else if (data && data.list) {
        list = data;
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
  },

  onTogglePicker: function () {
    var show = !this.data.showPicker;
    if (show) {
      var idx = 0;
      var sel = this.data.selectedMonth;
      if (sel) {
        for (var i = 0; i < this.data.monthOptions.length; i++) {
          if (this.data.monthOptions[i].value === sel) {
            idx = i;
            break;
          }
        }
      }
      this.setData({ showPicker: true, pickerValue: [idx] });
    } else {
      this.setData({ showPicker: false });
    }
  },

  onPickerChange: function (e) {
    this.setData({ pickerValue: e.detail.value });
  },

  onConfirmMonth: function () {
    var idx = this.data.pickerValue[0];
    var option = this.data.monthOptions[idx];
    this.setData({
      selectedMonth: option.value,
      monthLabel: option.value || '筛选月份',
      showPicker: false
    });
    this.fetchOrders();
  },

  onClearFilter: function () {
    this.setData({
      selectedMonth: '',
      monthLabel: '筛选月份',
      showPicker: false
    });
    this.fetchOrders();
  }
});
