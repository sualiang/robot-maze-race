// 排行榜页
var request = require('../../utils/request');
var app = getApp();

Page({
  data: {
    loading: true,
    currentTab: 'daily',
    tabs: [
      { key: 'daily', label: '日榜' },
      { key: 'weekly', label: '周榜' },
      { key: 'all', label: '总榜' }
    ],
    myRanking: null,
    entries: [],
    hasMore: true,
    page: 1
  },

  onLoad: function () {
    this.loadData();
  },

  onShow: function () {
    // 切回 Tab 时刷新
    if (this.data.entries.length > 0) {
      this.loadData();
    }
  },

  loadData: function () {
    var that = this;
    that.setData({ loading: true, page: 1 });

    request.get('/player/leaderboard', {
      period: that.data.currentTab,
      page: 1,
      pageSize: 20
    }).then(function (res) {
      // Mock 数据
      var mockEntries = [];
      var myEntry = null;
      for (var i = 0; i < 15; i++) {
        var isMe = i === 4;
        var entry = {
          userId: 'user_' + i,
          rank: i + 1,
          nickname: isMe ? '小D' : '玩家' + (i + 1),
          avatar: '',
          score: (12 + Math.random() * 30).toFixed(1) + 's',
          isMe: isMe
        };
        mockEntries.push(entry);
        if (isMe) myEntry = entry;
      }

      that.setData({
        entries: res && res.list ? res.list : mockEntries,
        myRanking: res && res.myRanking ? res.myRanking : {
          rank: 5,
          bestScore: '42.3s',
          races: 12,
          beatPercent: 87
        },
        loading: false,
        hasMore: mockEntries.length >= 20
      });
    }).catch(function () {
      // 加载失败也显示 Mock
      var mockEntries = [];
      for (var i = 0; i < 10; i++) {
        mockEntries.push({
          userId: 'user_' + i,
          rank: i + 1,
          nickname: i === 3 ? '小D' : '玩家' + (i + 1),
          avatar: '',
          score: (15 + Math.random() * 25).toFixed(1) + 's',
          isMe: i === 3
        });
      }
      that.setData({
        entries: mockEntries,
        myRanking: { rank: 4, bestScore: '42.3s', races: 12, beatPercent: 87 },
        loading: false,
        hasMore: false
      });
    });
  },

  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key });
    this.loadData();
  },

  onLoadMore: function () {
    var that = this;
    var nextPage = that.data.page + 1;
    that.setData({ page: nextPage });

    request.get('/player/leaderboard', {
      period: that.data.currentTab,
      page: nextPage,
      pageSize: 20
    }).then(function (res) {
      var list = res && res.list ? res.list : [];
      that.setData({
        entries: that.data.entries.concat(list),
        hasMore: list.length >= 20
      });
    }).catch(function () {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.onLoadMore();
    }
  }
});
