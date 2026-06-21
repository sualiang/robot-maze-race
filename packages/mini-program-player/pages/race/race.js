/**
 * pages/race/race.js - 比赛页 (V2 重做)
 * 设计基准: 750rpx | 背景 #0F172A | 卡片 #1E293B
 * API: GET /api/v1/player/me/race-records, GET /api/v1/season/user/info
 */
var request = require('../../utils/request');

Page({
  data: {
    // 全局
    pageLoading: true,
    isLoggedIn: false,

    // 赛季最佳成绩（模块2 状态B）
    seasonBest: null,        // { scoreText, rank, beatPercent } 或 null(无记录)
    hasSeasonBest: false,

    // 历史参赛列表（模块3）
    historyRecords: [],
    historyLoading: false,

    // 参赛次数/购买逻辑
    remainCount: 0
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    // 每次显示刷新数据
    if (getApp().globalData.isLoggedIn) {
      this.fetchAll();
    } else {
      this.checkLogin();
    }
  },

  onPullDownRefresh: function () {
    if (getApp().globalData.isLoggedIn) {
      this.fetchAll().then(function () {
        wx.stopPullDownRefresh();
      }).catch(function () {
        wx.stopPullDownRefresh();
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin: function () {
    var that = this;
    var app = getApp();

    if (app.globalData.isLoggedIn) {
      this.setData({ isLoggedIn: true });
      this.fetchAll();
    } else {
      // 尝试静默登录
      var auth = require('../../utils/auth');
      auth.wxLogin().then(function () {
        that.setData({ isLoggedIn: true });
        that.fetchAll();
      }).catch(function () {
        that.setData({
          isLoggedIn: false,
          pageLoading: false,
          hasSeasonBest: false,
          historyRecords: []
        });
      });
    }
  },

  /**
   * 拉取所有数据
   */
  fetchAll: function () {
    var that = this;

    return Promise.all([
      that.fetchSeasonInfo(),
      that.fetchHistoryRecords()
    ]).then(function () {
      that.setData({ pageLoading: false });
    }).catch(function () {
      that.setData({ pageLoading: false });
    });
  },

  /**
   * GET /api/v1/season/user/info — 赛季信息(最佳成绩/排名)
   */
  fetchSeasonInfo: function () {
    var that = this;

    return request.get('/season/user/info').then(function (data) {
      if (!data) {
        that.setData({
          hasSeasonBest: false,
          seasonBest: null
        });
        return;
      }

      // 后端格式: { bestScore, bestRank, beatPercent, remainCount }
      var score = data.bestScore || data.score || 0;
      var rank = data.bestRank || data.rank || 0;

      // 如果成绩为0或没有,视为无记录
      if (score <= 0) {
        that.setData({
          hasSeasonBest: false,
          seasonBest: null,
          remainCount: data.remainCount || 0
        });
        return;
      }

      var scoreText = formatScore(score);

      that.setData({
        hasSeasonBest: true,
        remainCount: data.remainCount || 0,
        seasonBest: {
          score: score,
          scoreText: scoreText,
          rank: rank,
          beatPercent: data.beatPercent || 0
        }
      });
    }).catch(function (err) {
      console.error('获取赛季信息失败', err);
      // 不阻塞页面,标记无记录
      that.setData({
        hasSeasonBest: false
      });
    });
  },

  /**
   * GET /api/v1/player/me/race-records — 历史参赛记录
   */
  fetchHistoryRecords: function () {
    var that = this;
    that.setData({ historyLoading: true });

    return request.get('/player/me/race-records').then(function (records) {
      var list = records || [];
      var mapped = list.map(function (item) {
        var score = item.bestTime || item.score || item.time || 0;
        var scoreText = formatScore(score);
        var rank = item.rank || 0;

        // 日期
        var dateText = '';
        if (item.createdAt || item.date) {
          var d = new Date(item.createdAt || item.date);
          dateText = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        }

        // 奖牌
        var medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else if (rank <= 10) medal = '🏆';  // 前十展示奖杯

        // 成长/积分 (mock or from backend)
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
          score: score,
          scoreText: scoreText,
          rank: rank,
          rankText: rank > 0 ? '第' + rank + '名' : '',
          medal: medal,
          dateText: dateText,
          bonusText: bonusText
        };
      });

      that.setData({
        historyRecords: mapped,
        historyLoading: false
      });
    }).catch(function (err) {
      console.error('获取历史记录失败', err);
      that.setData({
        historyRecords: [],
        historyLoading: false
      });
    });
  },

  // ===== 事件处理 =====

  /**
   * 去扫码参赛
   */
  onScanToRace: function () {
    var that = this;

    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }

    // 检查是否有剩余参赛次数
    if (this.data.remainCount <= 0) {
      wx.showModal({
        title: '参赛次数不足',
        content: '当前没有可用的参赛次数，是否前往购买参赛包？',
        confirmText: '去购买',
        success: function (res) {
          if (res.confirm) {
            that.onBuyPackage();
          }
        }
      });
      return;
    }

    wx.scanCode({
      onlyFromCamera: false,
      success: function (res) {
        // 扫码成功，交给后端解析
        wx.showLoading({ title: '处理中...' });
        request.post('/race/result', {
          code: res.result
        }).then(function () {
          wx.hideLoading();
          // 刷新数据
          that.fetchAll();
        }).catch(function (err) {
          wx.hideLoading();
          wx.showToast({ title: (err && err.message) || '扫码失败', icon: 'none' });
        });
      },
      fail: function () {
        // 用户取消扫码
      }
    });
  },

  /**
   * 点击最佳成绩卡片 → 跳转排行榜
   */
  onGoLeaderboard: function () {
    wx.switchTab({
      url: '/pages/leaderboard/leaderboard'
    });
  },

  /**
   * 点击历史记录 → 弹详情
   */
  onTapHistoryRecord: function (e) {
    var record = e.currentTarget.dataset;
    if (!record) return;

    var detailParts = [];
    if (record.scoretext) detailParts.push('成绩: ' + record.scoretext);
    if (record.ranktext) detailParts.push('排名: ' + record.ranktext);
    if (record.datetext) detailParts.push('时间: ' + record.datetext);
    if (record.bonustext) detailParts.push(record.bonustext);

    wx.showModal({
      title: '记录详情',
      content: detailParts.join('\n'),
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 购买参赛包 (底部固定条 + 次数不足引导)
   */
  onBuyPackage: function () {
    wx.navigateTo({
      url: '/pages/packages/packages'
    });
  },

  /**
   * 提示登录
   */
  promptLogin: function () {
    var that = this;
    wx.showModal({
      title: '提示',
      content: '请先登录后再参赛',
      cancelText: '稍后再说',
      success: function (res) {
        if (res.confirm) {
          var auth = require('../../utils/auth');
          auth.wxLogin().then(function () {
            that.checkLogin();
          });
        }
      }
    });
  }
});

/**
 * 格式化成绩
 * 小于60秒: "38.1s"
 * 大于60秒: "1m23.4s"
 */
function formatScore(score) {
  if (typeof score !== 'number') return '--';
  if (score < 60) {
    return score.toFixed(1) + 's';
  }
  var m = Math.floor(score / 60);
  var s = (score % 60).toFixed(1);
  return m + 'm' + s + 's';
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
