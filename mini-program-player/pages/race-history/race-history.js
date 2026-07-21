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
          if (scoreNum < 60) {
            scoreText = scoreNum.toFixed(1) + 's';
          } else {
            var m = Math.floor(scoreNum / 60);
            var s = (scoreNum % 60).toFixed(1);
            scoreText = m + 'm' + s + 's';
          }
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
