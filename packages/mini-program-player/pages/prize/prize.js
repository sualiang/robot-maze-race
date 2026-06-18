// 奖品陈列页
var request = require('../../utils/request');

Page({
  data: {
    tabs: [
      { key: 'sponsor', label: '商家赞助' },
      { key: 'physical', label: '实物奖品' },
      { key: 'virtual', label: '虚拟奖品' }
    ],
    currentTab: 'sponsor',
    prizes: [],
    poolTotal: '',
    poolConfigured: false,
    prizeApiNotReady: false
  },

  onLoad: function () {
    this.fetchPoolConfig();
    this.fetchPrizes();
  },

  fetchPoolConfig: function () {
    var that = this;
    request.silentGet('/prize/pool').then(function (res) {
      if (res) {
        var total = res.total || res.poolAmount || res.poolTotal || '';
        that.setData({
          poolTotal: total ? total + ' 元' : '奖池配置中',
          poolConfigured: true
        });
      }
    }).catch(function () {
      that.setData({
        poolTotal: '奖池配置加载中...',
        poolConfigured: true
      });
    });
  },

  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key, prizes: [] });
    this.fetchPrizes();
  },

  fetchPrizes: function () {
    var that = this;
    request.silentGet('/prize/list', { category: this.data.currentTab }).then(function (res) {
      var list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && Array.isArray(res.list)) {
        list = res.list;
      } else if (res && Array.isArray(res.prizes)) {
        list = res.prizes;
      }
      if (list.length > 0) {
        that.setData({ prizes: list });
      } else {
        that.setData({
          prizes: [],
          prizeApiNotReady: true
        });
      }
    }).catch(function () {
      that.setData({
        prizes: [],
        prizeApiNotReady: true
      });
    });
  }
});
