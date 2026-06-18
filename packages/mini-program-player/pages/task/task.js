// 任务中心
var request = require('../../utils/request');

Page({
  data: {
    tabs: [
      { key: 'daily', label: '每日任务' },
      { key: 'growth', label: '成长任务' }
    ],
    currentTab: 'daily',
    tasks: [],
    countdownText: ''
  },

  onLoad: function () {
    this.fetchTasks();
  },

  onShow: function () {
    if (this.data.currentTab === 'daily') {
      this.fetchTasks();
    }
  },

  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key, tasks: [] });
    this.fetchTasks();
  },

  fetchTasks: function () {
    var that = this;
    request.get('/task/list', { tab: this.data.currentTab }).then(function (res) {
      var list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res && Array.isArray(res.list)) {
        list = res.list;
      } else if (res && Array.isArray(res.tasks)) {
        list = res.tasks;
      }

      // 计算每个任务的进度百分比
      list = list.map(function (t) {
        var current = t.currentProgress || t.current || 0;
        var total = t.totalProgress || t.targetProgress || t.target || 1;
        var percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        return Object.assign({}, t, {
          progressPercent: percent
        });
      });

      that.setData({ tasks: list });

      // 如果是每日任务，获取重置倒计时
      if (that.data.currentTab === 'daily' && res.countdown) {
        that.setData({ countdownText: that.formatCountdown(res.countdown) });
      } else if (that.data.currentTab === 'daily') {
        // 尝试倒计时接口
        that.fetchCountdown();
      }
    }).catch(function () {
      that.setData({ tasks: [] });
    });
  },

  fetchCountdown: function () {
    var that = this;
    request.silentGet('/task/daily/countdown').then(function (res) {
      if (res && res.countdown) {
        that.setData({ countdownText: that.formatCountdown(res.countdown) });
      }
    }).catch(function () {
      // 静默
    });
  },

  formatCountdown: function (seconds) {
    if (!seconds && seconds !== 0) return '';
    seconds = Math.floor(seconds);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  },

  onClaim: function (e) {
    var that = this;
    var taskId = e.currentTarget.dataset.id;
    if (!taskId) return;

    request.post('/task/reward', { taskId: taskId }).then(function () {
      wx.showToast({ title: '领取成功', icon: 'success' });
      that.fetchTasks();
    }).catch(function () {
      wx.showToast({ title: '领取失败', icon: 'none' });
    });
  }
});
