// pages/race-history/race-history.js - 我的比赛记录（全部）
var request = require('../../utils/request');

function pad(n) { return n < 10 ? '0' + n : '' + n; }

Page({
  data: {
    records: [],
    loading: true,
    selectedMonth: '',
    monthLabel: '全部月份',
    pickerValue: ''
  },

  onLoad: function () {
    this.fetchRecords();
  },

  fetchRecords: function () {
    var that = this;
    that.setData({ loading: true });

    var url = '/player/me/race-records';
    var month = that.data.selectedMonth;
    if (month) {
      url += '?month=' + encodeURIComponent(month);
    }

    request.get(url).then(function (list) {
      var records = (list || []).map(function (item) {
        var score = item.bestTime || item.score || item.time || 0;
        var scoreNum = typeof score === 'number' ? score : parseFloat(score) || 0;

        var scoreText = '--';
        if (scoreNum > 0) {
          var ms = scoreNum < 1000 ? Math.round(scoreNum * 1000) : Math.round(scoreNum);
          var totalSec2 = Math.floor(ms / 1000);
          var min2 = Math.floor(totalSec2 / 60);
          var sec2 = totalSec2 % 60;
          var cs2 = Math.floor((ms % 1000) / 10);
          function pad2(n) { return n < 10 ? '0' + n : '' + n; }
          scoreText = pad2(min2) + ':' + pad2(sec2) + '.' + pad2(cs2);
        }

        var rank = item.rank || 0;
        var medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';

        var dateText = '';
        if (item.createdAt || item.date) {
          var d = new Date(item.createdAt || item.date);
          dateText = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        }

        var growth = item.growth || 0;
        var points = item.points || 0;
        var bonusText = '';
        if (growth > 0) bonusText += '成长+' + growth;
        if (points > 0) {
          if (bonusText) bonusText += ' ';
          bonusText += '积分+' + points;
        }

        return {
          id: item.id || '',
          score: scoreNum,
          scoreText: scoreText,
          rank: rank,
          medal: medal,
          dateText: dateText,
          bonusText: bonusText
        };
      });

      that.setData({ records: records, loading: false });
    }).catch(function (err) {
      console.error('获取历史记录失败', err);
      that.setData({ records: [], loading: false });
    });
  },

  onMonthChange: function (e) {
    var val = e.detail.value; // "YYYY-MM"
    if (!val) {
      this.setData({ selectedMonth: '', monthLabel: '全部月份', pickerValue: '' });
    } else {
      var parts = val.split('-');
      this.setData({
        selectedMonth: val,
        monthLabel: parts[0] + '年' + parseInt(parts[1], 10) + '月',
        pickerValue: val
      });
    }
    this.fetchRecords();
  },

  onBack: function () {
    wx.navigateBack();
  }
});
