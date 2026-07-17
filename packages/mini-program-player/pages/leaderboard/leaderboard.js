/**
 * pages/leaderboard/leaderboard.js - V4
 * 全市季度赛 / 全省年度总决赛 四阶段
 */
var request = require('../../utils/request');

var PHASE_MAP = { not_started: 0, registration: 1, ongoing: 2, ended: 3 };
var PHASE_LABELS = { not_started: '赛事预告', registration: '报名中', ongoing: '进行中', ended: '已结束' };

Page({
  data: {
    pageLoading: true,
    myUserId: '',

    // 双标签
    tabs: [
      { key: 'quarter', label: '全市季度赛', phase: 'not_started' },
      { key: 'year', label: '全省年度总决赛', phase: 'not_started' }
    ],
    currentTab: 'quarter',

    // 赛季配置（从 /rank/config 加载）
    config: { quarter: null, year: null },

    // 我的排名
    myRanking: { rank: '-', region: '--', bestScore: '--', clubName: '--', totalRaces: 0, beatPercent: 0 },

    // 阶段数据
    // phase 0: threshold + qualified-list
    threshold: null,
    qualifiedList: [],

    // phase 1: registration status
    regStatus: null,

    // phase 2 & 3: 榜单
    entries: [],
    finalResult: null,
    listLoading: false,
    hasMore: true
  },

  onLoad: function () {
    var that = this;
    that.setData({ pageLoading: true });
    var userInfo = wx.getStorageSync('player_user');
    if (userInfo && userInfo.id) that.setData({ myUserId: userInfo.id });
    that._loadConfig().finally(function () { that.setData({ pageLoading: false }); });
  },

  onShow: function () {
    if (!this.data.pageLoading) this._refreshCurrentTab();
  },

  // ===== 加载赛季配置 =====
  _loadConfig: function () {
    var that = this;
    return request.silentGet('/rank/config').then(function (res) {
      var cfg = res || {};
      var tabs = [
        {
          key: 'quarter',
          label: (cfg.quarter && cfg.quarter.name) || '全市季度赛',
          phase: (cfg.quarter && cfg.quarter.phase) || 'not_started'
        },
        {
          key: 'year',
          label: (cfg.year && cfg.year.name) || '全省年度总决赛',
          phase: (cfg.year && cfg.year.phase) || 'not_started'
        }
      ];
      that.setData({ config: cfg, tabs: tabs });
      return that._refreshCurrentTab();
    }).catch(function () {
      // 默认值
    });
  },

  // ===== 刷新当前标签数据 =====
  _refreshCurrentTab: function () {
    var tab = this.data.currentTab;
    var phase = this._getCurrentPhase();
    if (phase === 'not_started') return this._loadThreshold(tab);
    if (phase === 'registration') return this._loadRegStatus(tab);
    if (phase === 'ongoing') return this._loadList(tab);
    if (phase === 'ended') return this._loadFinalResult(tab);
    return Promise.resolve();
  },

  // ===== 阶段判断 =====
  _getCurrentPhase: function () {
    var tab = this.data.currentTab;
    var tabs = this.data.tabs;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].key === tab) return tabs[i].phase;
    }
    return 'not_started';
  },

  // ===== 阶段0: 未开启 - 门槛信息 + 达标列表 =====
  _loadThreshold: function (season) {
    var that = this;
    that.setData({ listLoading: true });
    return Promise.all([
      request.silentGet('/rank/threshold', { season: season }),
      request.silentGet('/rank/qualified-list', { season: season })
    ]).then(function (results) {
      var t = results[0] || {};
      var q = results[1] || {};
      that.setData({
        threshold: t,
        qualifiedList: (q.list || []).slice(0, 10),
        listLoading: false
      });
    }).catch(function () {
      that.setData({ listLoading: false });
    });
  },

  // ===== 阶段1: 报名期 - 报名状态 =====
  _loadRegStatus: function (season) {
    var that = this;
    that.setData({ listLoading: true });
    return request.silentGet('/rank/registration-status', { season: season }).then(function (res) {
      that.setData({ regStatus: res || {}, listLoading: false });
    }).catch(function () {
      that.setData({ listLoading: false });
    });
  },

  // ===== 阶段2: 进行中 - 实时榜单 =====
  _loadList: function (season) {
    var that = this;
    that.setData({ listLoading: true });
    var ep = '/rank/total';
    return request.silentGet(ep, { page: 1, pageSize: 50 }).then(function (res) {
      var list = (res && res.entries) || [];
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
          clubName: mr.clubName || '--',
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
    });
  },

  // ===== 阶段3: 结束后 - 最终榜单 =====
  _loadFinalResult: function (season) {
    var that = this;
    that.setData({ listLoading: true });
    return request.silentGet('/rank/final-result', { season: season }).then(function (res) {
      var fmt = function (ms) {
        if (!ms) return '--';
        if (ms < 1000) return ms + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(2) + 's';
        return Math.floor(ms / 60000) + '\'' + ((ms % 60000) / 1000).toFixed(1) + '"';
      };
      var myId = that.data.myUserId;
      var list = (res && res.list) || [];
      list = list.map(function (item) {
        item.isMe = (item.userId || item.user_id || '') === myId;
        item.displayScore = fmt(item.bestScore || item.best_score || item.score);
        return item;
      });
      that.setData({
        finalResult: { list: list, promoted: (res && res.promoted) || [], quota: (res && res.quota) || 0 },
        listLoading: false
      });
    }).catch(function () {
      that.setData({ listLoading: false });
    });
  },

  // ===== 标签切换 =====
  onTabChange: function (e) {
    var k = e.currentTarget.dataset.key;
    if (k === this.data.currentTab) return;
    this.setData({ currentTab: k, entries: [], qualifiedList: [] });
    this._refreshCurrentTab();
  },

  // ===== 格式化 =====
  fmtMs: function (ms) {
    if (!ms) return '--';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(2) + 's';
    return Math.floor(ms / 60000) + '\'' + ((ms % 60000) / 1000).toFixed(1) + '"';
  }
});
