// pages/leaderboard/leaderboard.js - 排行榜
var request = require('../../utils/request');

Page({
  data: {
    tabIndex: 0,
    tabs: [
      { label: '日榜', value: 'daily' },
      { label: '月榜', value: 'monthly' },
      { label: '年榜', value: 'yearly' }
    ],
    entries: [],
    myRanking: null,
    loading: true,
    empty: false,
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onLoad: function () {
    this.loadLeaderboard('daily');
  },

  onTabChange: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    if (index === this.data.tabIndex) return;
    var type = this.data.tabs[index] ? this.data.tabs[index].value : 'daily';
    this.setData({ tabIndex: index, entries: [], page: 1, hasMore: true });
    this.loadLeaderboard(type);
  },

  formatScoreShort: function (score) {
    if (!score && score !== 0) return '-';
    if (score < 60) return score.toFixed(1) + '"';
    var m = Math.floor(score / 60);
    var s = (score % 60).toFixed(1);
    return m + "'" + s + '"';
  },

  formatMyBestScore: function (score) {
    if (!score && score !== 0) return '-';
    if (score < 60) return score.toFixed(1) + '秒';
    var mins = Math.floor(score / 60);
    var secs = (score % 60).toFixed(1);
    return mins + '分' + secs + '秒';
  },

  enrichEntries: function (entries) {
    for (var i = 0; i < entries.length; i++) {
      entries[i].scoreText = this.formatScoreShort(entries[i].score);
    }
    return entries;
  },

  enrichMyRanking: function (myRanking) {
    if (myRanking) {
      myRanking.rankText = myRanking.rank > 0 ? '第 ' + myRanking.rank + ' 名' : '未上榜';
      myRanking.scoreText = this.formatMyBestScore(myRanking.score);
    }
    return myRanking;
  },

  loadLeaderboard: function (type) {
    var that = this;
    that.setData({ loading: true, empty: false });
    request.get('/player/leaderboard', { type: type, page: that.data.page, pageSize: that.data.pageSize })
      .then(function (data) {
        var entries = that.enrichEntries(data.entries || []);
        var myRanking = that.enrichMyRanking(data.myRanking || null);
        that.setData({
          entries: entries,
          myRanking: myRanking,
          loading: false,
          empty: !data.entries || data.entries.length === 0,
          hasMore: data.entries ? data.entries.length >= that.data.pageSize : false
        });
      }).catch(function (err) {
        console.error('加载排行榜失败', err);
        that.setData({ loading: false });
      });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loading) return;
    var that = this;
    var page = that.data.page + 1;
    var type = that.data.tabs[that.data.tabIndex].value;
    that.setData({ page: page });
    request.get('/player/leaderboard', { type: type, page: page, pageSize: that.data.pageSize })
      .then(function (data) {
        var newEntries = data.entries || [];
        if (newEntries.length > 0) {
          that.enrichEntries(newEntries);
          that.setData({
            entries: that.data.entries.concat(newEntries),
            hasMore: newEntries.length >= that.data.pageSize
          });
        } else {
          that.setData({ hasMore: false });
        }
      }).catch(function () {
        that.setData({ page: page - 1 });
      });
  },

  onPullDownRefresh: function () {
    var that = this;
    var type = that.data.tabs[that.data.tabIndex].value;
    that.setData({ page: 1, entries: [] });
    that.loadLeaderboard(type).then(function () { wx.stopPullDownRefresh(); });
  },

  formatScore: function (seconds) {
    if (seconds < 60) return seconds.toFixed(1) + '秒';
    var mins = Math.floor(seconds / 60);
    var secs = (seconds % 60).toFixed(1);
    return mins + '分' + secs + '秒';
  },

  getRankIcon: function (rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return String(rank);
  },

  onShareAppMessage: function () {
    return {
      title: '机器狗迷宫竞速排行榜，看看你能排第几？',
      path: '/pages/leaderboard/leaderboard'
    };
  }
});
