// pages/race-history/race-history.js
var app = getApp();
var request = require('../../utils/request');

Page({
  data: {
    records: [],
    monthOptions: [],
    selectedMonth: '',
    loading: true,
    isEmpty: false
  },

  onLoad: function () {
    this.buildMonthOptions();
    this.fetchRecords();
  },

  onShow: function () {
    this.setData({ isLoggedIn: !!app.globalData.isLoggedIn });
    if (app.globalData.isLoggedIn) {
      this.fetchRecords();
    }
  },

  onPullDownRefresh: function () {
    var that = this;
    this.fetchRecords().then(function () {
      wx.stopPullDownRefresh();
    });
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

  fetchRecords: function () {
    var that = this;
    that.setData({ loading: true });

    var url = '/player/me/race-records';
    var month = that.data.selectedMonth;
    if (month) {
      url += '?month=' + encodeURIComponent(month);
    }

    return request.get(url).then(function (data) {
      var list = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);

      var mapped = list.map(function (item) {
        var score = item.score || 0;
        var scoreText = that.formatScore(score);
        var rank = item.rank || 0;

        var dateText = '';
        if (item.date) {
          var d = new Date(item.date);
          dateText = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
            that.pad(d.getHours()) + ':' + that.pad(d.getMinutes());
        }

        var medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';

        return {
          id: item.id || '',
          score: score,
          scoreText: scoreText,
          rank: rank,
          rankText: rank > 0 ? '第' + rank + '名' : '',
          medal: medal,
          dateText: dateText,
          venueName: item.venueName || '',
          status: item.status || ''
        };
      });

      that.setData({
        records: mapped,
        isEmpty: mapped.length === 0,
        loading: false
      });
    }).catch(function () {
      that.setData({ records: [], isEmpty: true, loading: false });
    });
  },

  onSelectMonth: function () {
    var that = this;
    var range = this.data.monthOptions.map(function (o) { return o.label; });
    var selectedMonth = this.data.selectedMonth;
    var currentIdx = 0;
    for (var i = 0; i < this.data.monthOptions.length; i++) {
      if (this.data.monthOptions[i].value === selectedMonth) {
        currentIdx = i;
        break;
      }
    }

    wx.showActionSheet({
      itemList: range,
      success: function (res) {
        var idx = res.tapIndex;
        var opt = that.data.monthOptions[idx];
        if (opt) {
          that.setData({ selectedMonth: opt.value });
          that.fetchRecords();
        }
      }
    });
  },

  formatScore: function (ms) {
    if (!ms || ms <= 0) return '0.0s';
    if (ms >= 1000000) {
      var m = Math.floor(ms / 60000);
      var s = ((ms % 60000) / 1000).toFixed(1);
      return m + '分' + s + '秒';
    }
    if (ms >= 60000) {
      var min = Math.floor(ms / 60000);
      var sec = ((ms % 60000) / 1000).toFixed(1);
      return min + ':' + (sec < 10 ? '0' : '') + sec;
    }
    return (ms / 1000).toFixed(1) + 's';
  },

  pad: function (n) {
    return n < 10 ? '0' + n : '' + n;
  },

  onTapRecord: function (e) {
    // 可扩展: 点击记录详情
    var item = e.currentTarget.dataset.item;
    if (item && item.scoreText) {
      wx.showToast({ title: item.scoreText, icon: 'none' });
    }
  }
});
