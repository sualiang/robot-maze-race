// pages/race-detail/race-detail.js - 赛事详情
var request = require('../../utils/request');

Page({
  data: {
    raceId: '',
    raceName: '',
    raceStatus: '',
    raceStatusText: '',
    raceStatusClass: '',
    raceTime: '',
    raceDesc: '',
    totalPlayers: 0,
    players: [],
    loading: true,
    isEmpty: false,
    // 分页
    page: 1,
    hasMore: true,
    playerPage: 1,
    playerHasMore: true
  },

  onLoad: function (options) {
    var raceId = options.raceId || '';
    this.setData({ raceId: raceId });
    if (raceId) {
      this.fetchRaceDetail();
      this.fetchPlayers();
    }
  },

  onPullDownRefresh: function () {
    var that = this;
    that.setData({ playerPage: 1, players: [], playerHasMore: true });
    Promise.all([that.fetchRaceDetail(), that.fetchPlayers()]).then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.playerHasMore && !this.data.loading) {
      this.fetchPlayers();
    }
  },

  fetchRaceDetail: function () {
    var that = this;
    return request.get('/operator/races/' + that.data.raceId).then(function (data) {
      var race = data.race || data;
      var status = race.status;

      var statusMap = {
        'pending': '未开始',
        'running': '进行中',
        'paused': '已暂停',
        'finished': '已结束',
        'cancelled': '已取消'
      };

      var classMap = {
        'pending': 'tag-info',
        'running': 'tag-success',
        'paused': 'tag-warning',
        'finished': 'tag-primary',
        'cancelled': 'tag-danger'
      };

      // 格式化时间
      var timeText = '';
      if (race.startTime) {
        var d = new Date(race.startTime);
        if (!isNaN(d.getTime())) {
          var month = d.getMonth() + 1;
          var day = d.getDate();
          var hours = d.getHours();
          var mins = d.getMinutes();
          if (hours < 10) hours = '0' + hours;
          if (mins < 10) mins = '0' + mins;
          timeText = month + '月' + day + '日 ' + hours + ':' + mins;
        } else {
          timeText = race.startTime;
        }
      }

      that.setData({
        raceName: race.name || '',
        raceStatus: status,
        raceStatusText: statusMap[status] || status,
        raceStatusClass: classMap[status] || '',
        raceTime: timeText,
        raceDesc: race.description || '',
        totalPlayers: race.playerCount || 0,
        loading: false
      });
    }).catch(function (err) {
      console.error('获取赛事详情失败', err);
      that.setData({ loading: false });
      wx.showToast({ title: '获取赛事详情失败', icon: 'none' });
    });
  },

  fetchPlayers: function () {
    var that = this;
    that.setData({ loading: true });

    return request.get('/operator/races/' + that.data.raceId + '/players', {
      page: that.data.playerPage,
      pageSize: 20
    }).then(function (data) {
      var list = data.list || data.players || [];
      var players = that.data.players.concat(list);
      var hasMore = list.length >= 20;

      // 预处理：格式化成绩
      for (var i = 0; i < players.length; i++) {
        if (!players[i]._formatted) {
          players[i].scoreText = that.formatScore(players[i].score);
          players[i].rankText = that.formatRank(players[i].rank);
          players[i].finishText = players[i].finished ? '已完成' : '未完成';
          players[i].finishClass = players[i].finished ? 'tag-success' : 'tag-warning';
          players[i]._formatted = true;
        }
      }

      that.setData({
        players: players,
        loading: false,
        isEmpty: players.length === 0,
        playerPage: that.data.playerPage + 1,
        playerHasMore: hasMore
      });
    }).catch(function (err) {
      console.error('获取参赛选手失败', err);
      that.setData({ loading: false, isEmpty: that.data.players.length === 0 });
    });
  },

  formatScore: function (score) {
    if (score === undefined || score === null) return '--';
    if (score <= 0) return '--';
    return score.toFixed(2) + 's';
  },

  formatRank: function (rank) {
    if (!rank || rank <= 0) return '--';
    return '#' + rank;
  },

  // 暂停赛事
  pauseRace: function () {
    this.confirmRaceAction('pause', '暂停赛事', '确认暂停当前赛事？选手将无法继续参赛。');
  },

  // 恢复赛事
  resumeRace: function () {
    this.confirmRaceAction('resume', '恢复赛事', '确认恢复当前赛事？选手可以继续参赛。');
  },

  // 结束赛事
  finishRace: function () {
    this.confirmRaceAction('finish', '结束赛事', '确认结束当前赛事？结束后无法恢复。');
  },

  confirmRaceAction: function (action, title, content) {
    var that = this;
    wx.showModal({
      title: title,
      content: content,
      confirmText: '确认',
      confirmColor: action === 'finish' ? '#ff4d4f' : '#0f3460',
      success: function (res) {
        if (res.confirm) {
          that.doRaceAction(action);
        }
      }
    });
  },

  doRaceAction: function (action) {
    var that = this;
    var statusMap = {
      'pause': 'paused',
      'resume': 'running',
      'finish': 'finished'
    };

    request.put('/operator/races/' + that.data.raceId + '/status', {
      action: action
    }).then(function () {
      wx.showToast({
        title: action === 'pause' ? '已暂停' : (action === 'resume' ? '已恢复' : '已结束'),
        icon: 'success'
      });
      // 更新本地状态
      var newStatus = statusMap[action];
      var statusTextMap = {
        'paused': '已暂停',
        'running': '进行中',
        'finished': '已结束'
      };
      var classMap = {
        'paused': 'tag-warning',
        'running': 'tag-success',
        'finished': 'tag-primary'
      };
      that.setData({
        raceStatus: newStatus,
        raceStatusText: statusTextMap[newStatus] || newStatus,
        raceStatusClass: classMap[newStatus] || ''
      });
    }).catch(function (err) {
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    });
  },

  // 分享赛事
  onShareAppMessage: function () {
    return {
      title: this.data.raceName + ' — 机器狗迷宫竞速',
      path: '/pages/race-detail/race-detail?raceId=' + this.data.raceId
    };
  }
});
