/**
 * pages/race/race.js - 比赛页 (V3 三状态重构)
 * 
 * 状态1: 无运营商上下文 → 显示扫码引导
 * 状态2: 有上下文 + 剩余次数 > 0 → 立即参赛按钮
 * 状态3: 有上下文 + 剩余次数 = 0 → 购买参赛包引导
 */
var request = require('../../utils/request');

Page({
  data: {
    // 全局
    pageLoading: true,
    isLoggedIn: false,

    // 三状态核心
    hasContext: false,
    venueName: '',
    venueId: '',
    remainCount: 0,
    currentUserId: '',

    // 比赛状态
    myStatus: 'idle', // idle | waiting | called | skipped | racing
    prevMyStatus: 'idle',
    lastRaceResult: null, // 最近一次比赛成绩
    showResultCard: false,
    resultCardTimer: null,
    canCheckin: true,  // 成绩卡片显示期间禁止签到，防竞态
   
    // 赛季最佳成绩
    seasonBest: null,
    hasSeasonBest: false,

    // 月份筛选
    selectedMonth: '',
    historyMonths: [],

    // 历史参赛列表
    historyRecords: [],
    truncatedHistory: [],
    historyLoading: false,

    // 实时排队
    queueList: [],
    currentRacer: null,
    queueVisible: false,
    queueTimer: null
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    if (getApp().globalData.isLoggedIn) {
      this.fetchAll();
      this.startQueuePolling();
    } else {
      this.checkLogin();
    }
  },

  onHide: function () {
    this.stopQueuePolling();
  },

  onUnload: function () {
    this.stopQueuePolling();
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

  checkLogin: function () {
    var that = this;
    var app = getApp();

    // 获取当前用户 ID
    var userId = '';
    if (app.globalData.userInfo && app.globalData.userInfo.id) {
      userId = app.globalData.userInfo.id;
    }

    if (app.globalData.isLoggedIn) {
      this.setData({ isLoggedIn: true, currentUserId: userId });
      this.fetchAll();
    } else {
      var auth = require('../../utils/auth');
      auth.wxLogin().then(function () {
        var uid = '';
        if (getApp().globalData.userInfo && getApp().globalData.userInfo.id) {
          uid = getApp().globalData.userInfo.id;
        }
        that.setData({ isLoggedIn: true, currentUserId: uid });
        that.fetchAll();
      }).catch(function () {
        that.setData({
          isLoggedIn: false,
          pageLoading: false
        });
      });
    }
  },

  fetchAll: function () {
    var that = this;

    return Promise.all([
      that.fetchVenueContext(),
      that.fetchSeasonInfo(),
      that.fetchHistoryRecords()
    ]).then(function () {
      that.setData({ pageLoading: false });
    }).catch(function () {
      that.setData({ pageLoading: false });
    });
  },

  /**
   * 获取运营商上下文 + 赛场名称
   */
  fetchVenueContext: function () {
    var that = this;

    return request.get('/player/context/current').then(function (data) {
      var d = data.data || data;
      if (d && d.hasContext) {
        that.setData({
          hasContext: true,
          venueName: d.venueName || '',
          venueId: d.venueId || ''
        });
        that.startQueuePolling();
      } else {
        that.setData({
          hasContext: false,
          venueName: '',
          venueId: ''
        });
        that.stopQueuePolling();
      }
    }).catch(function () {
      that.setData({
        hasContext: false,
        venueName: ''
      });
    });
  },

  /**
   * 开始排队轮询（每 3 秒查询一次）
   */
  startQueuePolling: function () {
    var that = this;
    that.stopQueuePolling();
    // 立即拉一次
    that.fetchQueueData();
    that.data.queueTimer = setInterval(function () {
      that.fetchQueueData();
    }, 3000);
  },

  stopQueuePolling: function () {
    if (this.data.queueTimer) {
      clearInterval(this.data.queueTimer);
      this.data.queueTimer = null;
    }
    if (this.data.resultCardTimer) {
      clearTimeout(this.data.resultCardTimer);
      this.data.resultCardTimer = null;
    }
  },

  /**
   * 获取排队数据
   */
  fetchQueueData: function () {
    var that = this;
    request.silentGet('/player/queue/current').then(function (data) {
      if (!data) {
        that.setData({ queueList: [], currentRacer: null });
        return;
      }
      var list = data.queue || [];
      var current = data.currentRacer || null;
      var newStatus = data.myStatus || 'idle';
      var prevStatus = that.data.myStatus;
      var lastResult = data.lastRaceResult || null;

      var updateData = {
        queueList: list,
        currentRacer: current,
        queueVisible: list.length > 0 || current != null,
        myStatus: newStatus,
        prevMyStatus: prevStatus
      };

      // 检测状态变化: 从非 idle 变为 idle → 显示成绩卡片
      if (prevStatus !== 'idle' && newStatus === 'idle' && lastResult) {
        updateData.lastRaceResult = lastResult;
        updateData.showResultCard = true;
        updateData.canCheckin = false;  // 锁定签到，防竞态
        // 3-5秒后自动消失
        if (that.data.resultCardTimer) clearTimeout(that.data.resultCardTimer);
        var timer = setTimeout(function () {
          that.setData({ showResultCard: false, canCheckin: true });
        }, 4000);
        that.data.resultCardTimer = timer;
      }

      that.setData(updateData);
    }).catch(function () {
      // 静默失败
    });
  },

  /**
   * 获取赛季信息（最佳成绩/排名/剩余次数）
   */
  fetchSeasonInfo: function () {
    var that = this;

    return request.get('/season/user/info').then(function (data) {
      if (!data) {
        that.setData({ hasSeasonBest: false, seasonBest: null });
        return;
      }

      var score = data.bestScore || data.score || 0;
      var rank = data.bestRank || data.rank || 0;
      var remain = data.remainCount || 0;

      that.setData({ remainCount: remain });

      if (score <= 0) {
        that.setData({ hasSeasonBest: false, seasonBest: null });
        return;
      }

      var scoreText = formatScore(score);

      that.setData({
        hasSeasonBest: true,
        seasonBest: {
          score: score,
          scoreText: scoreText,
          rank: rank,
          beatPercent: data.beatPercent || 0
        }
      });
    }).catch(function (err) {
      console.error('获取赛季信息失败', err);
      that.setData({ hasSeasonBest: false });
    });
  },

  /**
   * 获取历史参赛记录
   */
  fetchHistoryRecords: function () {
    var that = this;
    that.setData({ historyLoading: true });

    var url = '/player/me/race-records';
    var month = that.data.selectedMonth;
    if (month) {
      url += '?month=' + encodeURIComponent(month);
    }

    return request.get(url).then(function (data) {
      var records = (data && data.records) ? data.records : (Array.isArray(data) ? data : []);
      var list = records || [];
      var mapped = list.map(function (item) {
        var score = item.bestTime || item.score || item.time || 0;
        var scoreText = formatScore(score);
        var rank = item.rank || 0;

        var dateText = '';
        var d = null;
        if (item.createdAt || item.date) {
          d = new Date(item.createdAt || item.date);
          dateText = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        }

        var medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else if (rank <= 10) medal = '🏆';

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
          bonusText: bonusText,
          monthKey: (d ? d.getFullYear() + '-' + ((d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1)) : ''),
          monthLabel: (d ? d.getFullYear() + '年' + (d.getMonth() + 1) + '月' : '')
        };
      });

      // 截断：默认显示最近 6 条
      var truncated = mapped.length > 6 ? mapped.slice(0, 6) : mapped;

      var result = {
        historyRecords: mapped,
        truncatedHistory: truncated,
        historyLoading: false
      };

      // 构建月份选项
      if (data && data.availableMonths && that.data.historyMonths.length === 0) {
        var options = [{ label: '全部', value: '' }];
        (data.availableMonths || []).forEach(function (m) {
          options.push({ label: m, value: m });
        });
        result.historyMonths = options;
      }

      that.setData(result);
    }).catch(function (err) {
      console.error('获取历史记录失败', err);
      that.setData({ historyRecords: [], truncatedHistory: [], historyLoading: false });
    });
  },

  // 月份切换
  onSelectHistoryMonth: function (e) {
    var month = e.currentTarget.dataset.month;
    this.setData({ selectedMonth: month });
    this.fetchHistoryRecords();
  },

  // ===== 查看全部历史记录 =====
  onViewAllHistory: function () {
    wx.navigateTo({
      url: '/pages/race-history/race-history'
    });
  },

  // ===== 事件处理 =====

  /**
   * 状态1: 无上下文 → 弹出引导弹窗
   */
  onScanGuide: function () {
    var that = this;
    wx.showModal({
      title: '扫码参赛',
      content: '请扫描赛场专属小程序码入场，获取参赛上下文后再开始比赛',
      confirmText: '知道了',
      showCancel: false,
      success: function () {
        // 尝试调用扫码
        wx.scanCode({
          onlyFromCamera: false,
          success: function (res) {
            if (res.result) {
              request.post('/player/context/set', { code: res.result }).then(function () {
                that.fetchAll();
              }).catch(function (err) {
                wx.showToast({ title: (err && err.message) || '入场失败', icon: 'none' });
              });
            }
          },
          fail: function () {
            // 用户取消
          }
        });
      }
    });
  },

  /**
   * 状态2: 立即参赛 → 弹确认窗 → POST /checkin
   */
  onRaceNow: function () {
    var that = this;

    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }

    // 成绩卡片显示期间禁止签到，防竞态
    if (!this.data.canCheckin) {
      wx.showToast({ title: '正在结算成绩，请稍候...', icon: 'none' });
      return;
    }

    if (this.data.remainCount <= 0) {
      wx.showModal({
        title: '参赛次数不足',
        content: '当前没有可用的参赛次数，是否前往购买参赛包？',
        confirmText: '去购买',
        success: function (res) {
          if (res.confirm) that.onBuyPackage();
        }
      });
      return;
    }

    var venueId = that.data.venueId;
    var venueName = that.data.venueName;

    // 有赛场上下文：弹确认窗后直接签到
    if (venueId && venueName) {
      wx.showModal({
        title: '确认参赛',
        content: '确认后，会扣除 1 次参赛次数，并进入排队。请注意比赛现场大屏叫号，如叫号后 180 秒内未就位，将自动顺延至下一位。',
        confirmText: '确认参赛',
        cancelText: '取消',
        success: function (modalRes) {
          if (modalRes.confirm) {
            that.doCheckin(venueId);
          }
        }
      });
      return;
    }

    // 无赛场上下文：扫码获取 venue
    wx.scanCode({
      onlyFromCamera: false,
      success: function (res) {
        that.doCheckin(res.result);
      },
      fail: function () {
        // 用户取消
      }
    });
  },

  doCheckin: function (code) {
    var that = this;
    wx.showLoading({ title: '处理中...' });
    request.post('/player/checkin', { code: code }).then(function () {
      wx.hideLoading();
      that.fetchAll();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '参赛失败', icon: 'none' });
    });
  },

  /**
   * 状态3: 购买参赛包 → 跳转购买页
   */
  onBuyPackage: function () {
    wx.navigateTo({
      url: '/pages/packages/packages'
    });
  },

  /**
   * 跳转排行榜
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
  },

  noop: function () {}
});

function formatScore(score) {
  if (typeof score !== 'number' || score <= 0) return '--';
  // 兼容毫秒和秒两种输入
  var ms = score < 1000 ? Math.round(score * 1000) : Math.round(score);
  var totalSec = Math.floor(ms / 1000);
  var min = Math.floor(totalSec / 60);
  var sec = totalSec % 60;
  var cs = Math.floor((ms % 1000) / 10);
  return pad(min) + ':' + pad(sec) + '.' + pad(cs);
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

module.exports = null;
