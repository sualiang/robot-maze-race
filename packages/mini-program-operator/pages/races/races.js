// pages/races/races.js - 赛事列表
var request = require('../../utils/request');

Page({
  data: {
    venueName: '',
    races: [],
    loading: true,
    isEmpty: false,
    activeTab: 'all',
    page: 1,
    hasMore: true,
    isLoggedIn: false
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
    if (this.data.isLoggedIn) {
      this.setData({ page: 1, races: [], hasMore: true });
      this.fetchRaces();
    }
  },

  onPullDownRefresh: function () {
    var that = this;
    this.setData({ page: 1, races: [], hasMore: true });
    that.fetchRaces().then(function () {
      wx.stopPullDownRefresh();
    }).catch(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.fetchRaces();
    }
  },

  checkLogin: function () {
    var app = getApp();
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      venueName: app.globalData.venueName || ''
    });
  },

  fetchRaces: function () {
    var that = this;
    var app = getApp();
    var venueId = app.globalData.venueId;

    if (!venueId) {
      that.setData({ loading: false, isEmpty: true });
      return Promise.resolve();
    }

    that.setData({ loading: true });

    var params = {
      venueId: venueId,
      page: that.data.page,
      pageSize: 20
    };

    if (that.data.activeTab !== 'all') {
      params.status = that.data.activeTab;
    }

    return request.get('/operator/races', params).then(function (data) {
      var list = data.list || data.races || [];
      var races = that.data.races.concat(list);
      var hasMore = list.length >= 20;

      // 预处理数据：状态文本和格式化时间
      for (var i = 0; i < races.length; i++) {
        if (!races[i]._formatted) {
          races[i].statusText = that.getStatusText(races[i].status);
          races[i].statusClass = that.getStatusClass(races[i].status);
          races[i].timeText = that.formatTime(races[i].startTime);
          races[i]._formatted = true;
        }
      }

      that.setData({
        races: races,
        loading: false,
        isEmpty: races.length === 0,
        page: that.data.page + 1,
        hasMore: hasMore
      });
    }).catch(function (err) {
      console.error('获取赛事列表失败', err);
      that.setData({ loading: false, isEmpty: that.data.races.length === 0 });
    });
  },

  getStatusText: function (status) {
    var map = {
      'pending': '未开始',
      'running': '进行中',
      'paused': '已暂停',
      'finished': '已结束',
      'cancelled': '已取消'
    };
    return map[status] || status || '未知';
  },

  getStatusClass: function (status) {
    var map = {
      'pending': 'tag-info',
      'running': 'tag-success',
      'paused': 'tag-warning',
      'finished': 'tag-primary',
      'cancelled': 'tag-danger'
    };
    return map[status] || '';
  },

  formatTime: function (timeStr) {
    if (!timeStr) return '';
    // 支持 ISO 字符串或时间戳
    var d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hours = d.getHours();
    var mins = d.getMinutes();
    if (hours < 10) hours = '0' + hours;
    if (mins < 10) mins = '0' + mins;
    return month + '/' + day + ' ' + hours + ':' + mins;
  },

  // 切换Tab筛选
  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({
      activeTab: tab,
      page: 1,
      races: [],
      hasMore: true,
      isEmpty: false
    });
    this.fetchRaces();
  },

  // 跳转赛事详情
  goToDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/race-detail/race-detail?raceId=' + id });
  },

  // 创建赛事
  createRace: function () {
    wx.showModal({
      title: '创建赛事',
      content: '请在管理后台创建赛事，移动端暂不支持创建',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
