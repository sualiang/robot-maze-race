// 积分抽奖
var request = require('../../utils/request');

Page({
  data: {
    pointsBalance: 0,
    singleCost: 100,
    multiCost: 500,
    drawCountOptions: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    drawCount: 0,
    showDrawResult: false,
    drawResultText: '',
    historyRecords: []
  },

  onLoad: function () {
    this.fetchPointsBalance();
    this.fetchHistory();
    this.fetchDrawConfig();
  },

  onShow: function () {
    this.fetchPointsBalance();
  },

  fetchDrawConfig: function () {
    var that = this;
    request.silentGet('/points/lottery/config').then(function (res) {
      if (res) {
        that.setData({
          singleCost: res.singleCost || res.single_cost || 100,
          multiCost: res.multiCost || res.multi_cost || 500
        });
      }
    }).catch(function () {
      // 使用默认值
    });
  },

  fetchPointsBalance: function () {
    var that = this;
    request.silentGet('/points/balance').then(function (res) {
      var balance = res && (res.balance || res.points || res.pointsBalance) ? (res.balance || res.points || res.pointsBalance) : 0;
      that.setData({ pointsBalance: balance });
    }).catch(function () {
      // 静默
    });
  },

  fetchHistory: function () {
    var that = this;
    request.silentGet('/points/lottery/history').then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.list ? res.list : []);
      that.setData({ historyRecords: list });
    }).catch(function () {
      that.setData({ historyRecords: [] });
    });
  },

  onDrawCountChange: function (e) {
    this.setData({ drawCount: parseInt(e.detail.value) });
  },

  onDrawSingle: function () {
    var that = this;
    var cost = that.data.singleCost;
    if (that.data.pointsBalance < cost) {
      wx.showToast({ title: '积分不足', icon: 'none' });
      return;
    }
    that.doDraw(1);
  },

  onDrawMulti: function () {
    var that = this;
    var count = that.data.drawCountOptions[that.data.drawCount];
    var cost = that.data.singleCost * count;
    if (that.data.pointsBalance < cost) {
      wx.showToast({ title: '积分不足', icon: 'none' });
      return;
    }
    that.doDraw(count);
  },

  doDraw: function (count) {
    var that = this;
    request.post('/points/lottery/draw', { draw_count: count }).then(function (res) {
      var prizeText = '';
      if (res && res.prizes) {
        if (Array.isArray(res.prizes)) {
          prizeText = res.prizes.map(function (p) { return p.name || p.prizeName || '奖品'; }).join('、');
        } else {
          prizeText = res.prizes.name || res.prizes.prizeName || '奖品';
        }
      } else if (res && res.name) {
        prizeText = res.name;
      } else {
        prizeText = '谢谢参与';
      }
      that.setData({
        showDrawResult: true,
        drawResultText: prizeText
      });
      that.fetchPointsBalance();
      that.fetchHistory();
    }).catch(function () {
      wx.showToast({ title: '抽奖失败', icon: 'none' });
    });
  },

  onCloseResult: function () {
    this.setData({ showDrawResult: false });
  }
});
