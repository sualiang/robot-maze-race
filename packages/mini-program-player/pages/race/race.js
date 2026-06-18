// pages/race/race.js - 比赛页
var request = require('../../utils/request');

Page({
  data: {
    // 页面状态: idle | queuing | finished
    raceStatus: 'idle',
    pageLoading: true,

    // 通用
    isLoggedIn: false,
    remainCount: 0,

    // 状态1 - idle：历史记录
    historyRecords: [],
    historyLoading: false,

    // 状态2 - queuing：排队信息
    queueInfo: {
      queueNumber: 3,
      aheadCount: 2,
      estimatedWait: 5,
      currentCallNumber: 1,
      venueName: '铁甲快狗·万象城赛场',
      venueAddress: '万象城B1层中庭'
    },

    // 状态3 - finished：比赛结果
    raceResult: {
      score: 42.3,
      scoreText: '42.3s',
      timeText: '42.3秒',
      rank: 1,
      medalEmoji: '🥇',
      beatPercent: 87,
      trackName: '极速赛道A',
      venueName: '铁甲快狗·万象城赛场',
      dateText: '6月16日 13:00'
    },

    // 轮询定时器
    pollTimer: null
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
  },

  onHide: function () {
    this.stopPolling();
  },

  onUnload: function () {
    this.stopPolling();
  },

  /**
   * 检查登录状态 & 获取最新比赛状态
   */
  checkLogin: function () {
    var app = getApp();
    var loggedIn = !!app.globalData.isLoggedIn;

    this.setData({
      isLoggedIn: loggedIn
    });

    if (loggedIn) {
      this.fetchRaceStatus();
      this.fetchHistoryRecords();
    } else {
      this.setData({
        pageLoading: false,
        raceStatus: 'idle'
      });
    }
  },

  /**
   * 获取当前比赛状态（空闲/排队/完成）
   */
  fetchRaceStatus: function () {
    var that = this;

    request.get('/player/me/stats').then(function (data) {
      var status = data && data.status ? data.status : 'idle';

      if (status === 'queuing') {
        that.setData({
          raceStatus: 'queuing',
          queueInfo: {
            queueNumber: data.queueNumber || 3,
            aheadCount: data.aheadCount || 2,
            estimatedWait: data.estimatedWait || 5,
            currentCallNumber: data.currentCallNumber || 1,
            venueName: data.venueName || '铁甲快狗·万象城赛场',
            venueAddress: data.venueAddress || '万象城B1层中庭'
          },
          pageLoading: false
        });
        that.startPolling();

      } else if (status === 'finished') {
        var result = data.raceResult || {};
        var score = result.score || 42.3;
        var scoreText = score < 60 ? score.toFixed(1) + 's' : Math.floor(score / 60) + 'm' + (score % 60).toFixed(1) + 's';
        var rank = result.rank || 1;
        var medalMap = ['', '🥇', '🥈', '🥉'];

        that.setData({
          raceStatus: 'finished',
          remainCount: data.remainCount || that.data.remainCount,
          raceResult: {
            score: score,
            scoreText: scoreText,
            timeText: result.timeText || scoreText,
            rank: rank,
            medalEmoji: rank <= 3 ? medalMap[rank] : '🏅',
            beatPercent: result.beatPercent || 0,
            trackName: result.trackName || '极速赛道A',
            venueName: result.venueName || '铁甲快狗·万象城赛场',
            dateText: result.dateText || '6月16日 13:00'
          },
          pageLoading: false
        });

      } else {
        // idle
        var remainCount = data && data.remainCount !== undefined ? data.remainCount : 0;
        that.setData({
          raceStatus: 'idle',
          remainCount: remainCount,
          pageLoading: false
        });
      }
    }).catch(function (err) {
      console.error('获取比赛状态失败', err);
      // fallback: 从本地统计获取剩余次数
      that.fetchRemainCount();
      that.setData({
        pageLoading: false,
        raceStatus: 'idle'
      });
    });
  },

  /**
   * 获取剩余参赛次数（降级方案）
   */
  fetchRemainCount: function () {
    var that = this;
    request.silentGet('/player/me/stats').then(function (stats) {
      if (stats && stats.raceCount !== undefined) {
        that.setData({ remainCount: stats.raceCount });
      }
    }).catch(function () {});
  },

  /**
   * 获取历史参赛记录
   */
  fetchHistoryRecords: function () {
    var that = this;
    that.setData({ historyLoading: true });

    request.get('/player/me/race-records').then(function (records) {
      var list = records || [];
      var mapped = list.map(function (item) {
        var score = item.bestTime || item.score || 0;
        var scoreText = '';
        var timeText = '';
        if (score < 60) {
          scoreText = score.toFixed(1) + 's';
          timeText = score.toFixed(1) + '秒';
        } else {
          var m = Math.floor(score / 60);
          var s = (score % 60).toFixed(1);
          scoreText = m + 'm' + s + 's';
          timeText = m + '分' + s + '秒';
        }

        var dateText = '';
        if (item.createdAt || item.date) {
          var d = new Date(item.createdAt || item.date);
          dateText = (d.getMonth() + 1) + '月' + d.getDate() + '日';
        }

        return {
          id: item.id || '',
          venueName: item.venueName || item.venue_name || '',
          score: score,
          scoreText: scoreText,
          timeText: timeText,
          rank: item.rank || '-',
          rankText: item.rank ? '第' + item.rank + '名' : '-',
          dateText: dateText
        };
      });

      that.setData({
        historyRecords: mapped,
        historyLoading: false
      });
    }).catch(function (err) {
      console.error('获取历史记录失败', err);
      that.setData({ historyLoading: false });
    });
  },

  /**
   * 轮询：每10秒更新排队状态
   */
  startPolling: function () {
    this.stopPolling();

    var that = this;
    var timer = setInterval(function () {
      request.silentGet('/player/checkin/queue').then(function (data) {
        if (!data) return;

        var newStatus = data.status || 'queuing';

        if (newStatus === 'finished') {
          // 排队结束，切换到完成状态
          that.stopPolling();
          that.fetchRaceStatus();
          return;
        }

        that.setData({
          'queueInfo.queueNumber': data.queueNumber || that.data.queueInfo.queueNumber,
          'queueInfo.aheadCount': data.aheadCount || 0,
          'queueInfo.estimatedWait': data.estimatedWait || 0,
          'queueInfo.currentCallNumber': data.currentCallNumber || that.data.queueInfo.currentCallNumber
        });
      }).catch(function (err) {
        console.error('轮询排队状态失败', err);
      });
    }, 10000);

    that.setData({ pollTimer: timer });
  },

  /**
   * 停止轮询
   */
  stopPolling: function () {
    var timer = this.data.pollTimer;
    if (timer) {
      clearInterval(timer);
      this.setData({ pollTimer: null });
    }
  },

  // ===== 事件处理 =====

  /**
   * 去扫码参赛 → 跳转首页tab
   */
  onGoCheckin: function () {
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  /**
   * 点开叫号提醒订阅
   */
  onSubscribeNotify: function () {
    var that = this;
    wx.requestSubscribeMessage({
      tmplIds: ['排队提醒模板ID'], // 替换为实际模板ID
      success: function (res) {
        if (res['排队提醒模板ID'] === 'accept') {
          wx.showToast({ title: '已开启提醒', icon: 'success' });
        } else {
          wx.showToast({ title: '已取消订阅', icon: 'none' });
        }
      },
      fail: function () {
        wx.showToast({ title: '订阅失败', icon: 'none' });
      }
    });
  },

  /**
   * 查看排行榜
   */
  onGoLeaderboard: function () {
    wx.switchTab({
      url: '/pages/leaderboard/leaderboard'
    });
  },

  /**
   * 查看赛场规则
   */
  onGoRules: function () {
    wx.navigateTo({
      url: '/pages/help/help'
    });
  },

  /**
   * 点击历史参赛记录
   */
  onTapHistoryRecord: function (e) {
    var id = e.currentTarget.dataset.id;
    // 可扩展：跳转详情页
    wx.showToast({ title: '查看记录详情', icon: 'none' });
  },

  /**
   * 再来一局（重新排队）
   */
  onRaceAgain: function () {
    var that = this;
    wx.showModal({
      title: '再来一局',
      content: '确定要重新排队参赛吗？',
      success: function (res) {
        if (res.confirm) {
          request.post('/checkin/quick-checkin').then(function (data) {
            var queueNum = data && data.queueNumber ? data.queueNumber : 1;
            var venueName = data && data.venueName ? data.venueName : '铁甲快狗·万象城赛场';
            var venueAddress = data && data.venueAddress ? data.venueAddress : '';
            var aheadCount = data && data.aheadCount !== undefined ? data.aheadCount : 0;

            that.setData({
              raceStatus: 'queuing',
              'queueInfo.queueNumber': queueNum,
              'queueInfo.venueName': venueName,
              'queueInfo.venueAddress': venueAddress,
              'queueInfo.aheadCount': aheadCount,
              'queueInfo.estimatedWait': Math.ceil(aheadCount * 2),
              'queueInfo.currentCallNumber': 1
            });

            that.startPolling();

            wx.showToast({ title: '已加入排队', icon: 'success' });
          }).catch(function (err) {
            wx.showToast({ title: (err && err.message) || '排队失败', icon: 'none' });
          });
        }
      }
    });
  },

  /**
   * 购买参赛包
   */
  onBuyPackage: function () {
    wx.navigateTo({
      url: '/pages/packages/packages'
    });
  },

  /**
   * 邀请好友助力
   */
  onInviteFriend: function () {
    wx.showToast({ title: '暂未开放', icon: 'none' });
  },

  /**
   * 提示登录
   */
  promptLogin: function () {
    var that = this;
    wx.showModal({
      title: '提示',
      content: '请先登录',
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

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function () {
    this.checkLogin();
    wx.stopPullDownRefresh();
  }
});
