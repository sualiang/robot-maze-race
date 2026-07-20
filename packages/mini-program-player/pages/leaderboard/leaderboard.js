/**
 * pages/leaderboard/leaderboard.js - V4
 * 全市季度赛 / 全省年度总决赛 四阶段
 */
var request = require('../../utils/request');

var PHASE_MAP = { not_started: 0, registration: 1, ongoing: 2, ended: 3 };
var PHASE_LABELS = { not_started: '赛事预告', registration: '报名中', ongoing: '进行中', ended: '已结束' };

function formatRaceTime(ms) {
  if (!ms || ms <= 0) return '--';
  var v = ms < 1000 ? Math.round(ms * 1000) : Math.round(ms);
  var totalSec = Math.floor(v / 1000);
  var min = Math.floor(totalSec / 60);
  var sec = totalSec % 60;
  var cs = Math.floor((v % 1000) / 10);
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return pad(min) + ':' + pad(sec) + '.' + pad(cs);
}

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

    // 临时：大屏实时排行榜
    liveLeaderboard: [],
    liveDate: '',

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
    that._fetchLiveLeaderboard();
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    if (!this.data.pageLoading) this._refreshCurrentTab();
    this._fetchLiveLeaderboard();
  },

  /**
   * 拉取大屏实时排行榜（临时覆盖层）
   */
  _fetchLiveLeaderboard: function () {
    var that = this;
    request.silentGet('/player/leaderboard/live').then(function (data) {
      var d = data.data || data;
      var list = (d.leaderboard || []).map(function (item) {
        return {
          rank: item.rank,
          nickname: item.nickname || '选手',
          avatar_url: item.avatar_url || '',
          finish_time_ms: item.finish_time_ms || 0,
          displayTime: that._formatRaceTime(item.finish_time_ms),
          status: item.status || 'finished'
        };
      });
      that.setData({
        liveLeaderboard: list,
        liveDate: d.date || ''
      });
    }).catch(function () {
      // 静默失败，保留旧数据
    });
  },

  _formatRaceTime: function (ms) {
    if (!ms || ms <= 0) return '--:--.--';
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    var cs = Math.floor((ms % 1000) / 10);
    return (min < 10 ? '0' + min : '' + min) + ':' + (sec < 10 ? '0' + sec : '' + sec) + '.' + (cs < 10 ? '0' + cs : '' + cs);
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
      var fmt = formatRaceTime;
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
        if ((item.avatarUrl || '').indexOf('http://tmp') === 0) item.avatarUrl = '';
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
      var fmt = formatRaceTime;
      var myId = that.data.myUserId;
      var list = (res && res.list) || [];
      list = list.map(function (item) {
        item.isMe = (item.userId || item.user_id || '') === myId;
        item.displayScore = fmt(item.bestScore || item.best_score || item.score);
        if ((item.avatarUrl || '').indexOf('http://tmp') === 0) item.avatarUrl = '';
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
    return formatRaceTime(ms);
  }
});
