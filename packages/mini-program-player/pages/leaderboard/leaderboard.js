/**
 * pages/leaderboard/leaderboard.js - V3
 */
var request = require('../../utils/request');

Page({
  data: {
    pageLoading: true,
    myRanking: { rank: '-', region: '--', bestScore: '--', clubName: '--', totalRaces: 0, beatPercent: 0 },
    currentTab: 'weekly',
    tabs: [{ key: 'daily', label: '日榜' }, { key: 'weekly', label: '周榜' }, { key: 'total', label: '总榜' }],
    entries: [],
    listLoading: true,
    hasMore: true,
    myUserId: ''
  },
  onLoad: function () {
    var that = this;
    that.setData({ pageLoading: true });
    var userInfo = wx.getStorageSync('player_user');
    if (userInfo && userInfo.id) that.setData({ myUserId: userInfo.id });
    that._loadList('weekly').finally(function () { that.setData({ pageLoading: false }); });
  },
  onShow: function () {
    if (!this.data.pageLoading) this._loadList(this.data.currentTab);
  },
  _loadList: function (tabKey) {
    var that = this;
    that.setData({ listLoading: true });
    var ep = tabKey === 'daily' ? '/rank/daily' : tabKey === 'weekly' ? '/rank/weekly' : '/rank/total';
    return request.silentGet(ep, { page: 1, pageSize: 50 }).then(function (res) {
      var list = (res && res.list) || (res && res.entries) || [];
      var mr = (res && res.myRanking) || {};
      var myId = that.data.myUserId;
      var fmt = function (ms) {
        if (!ms) return '--';
        if (ms < 1000) return ms + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(2) + 's';
        return Math.floor(ms / 60000) + '\'' + ((ms % 60000) / 1000).toFixed(1) + '"';
      };
      that.setData({
        myRanking: {
          rank: mr.rank || '-',
          region: mr.region || '--',
          bestScore: fmt(mr.bestScore),
          clubName: mr.clubName || mr.operatorName || '--',
          totalRaces: mr.totalRaces || 0,
          beatPercent: mr.beatPercent || 0
        }
      });
      list = list.map(function (item) {
        item.isMe = (item.userId || item.user_id || '') === myId;
        item.displayScore = fmt(item.bestScore || item.best_score || item.score);
        return item;
      });
      that.setData({ entries: list, hasMore: list.length >= 50, listLoading: false });
    }).catch(function () {
      that.setData({ entries: [], hasMore: false, listLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  onTabChange: function (e) {
    var k = e.currentTarget.dataset.key;
    if (k === this.data.currentTab) return;
    this.setData({ currentTab: k });
    this._loadList(k);
  }
});
