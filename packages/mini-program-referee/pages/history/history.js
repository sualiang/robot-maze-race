/**
 * 补零工具函数
 */
function padZero(num) {
  return num < 10 ? '0' + num : '' + num;
}



// ==================== 内联请求方法（避免模块导入兼容性问题） ====================
var BASE_URL = 'http://192.168.110.136:3000/api/v1';

function _request(url, options) {
  var opts = options || {};
  var method = opts.method || 'GET';
  var data = opts.data;
  var header = opts.header || {};

  return new Promise(function(resolve, reject) {
    var token = wx.getStorageSync('referee_token');
    wx.request({
      url: url.indexOf('http') === 0 ? url : BASE_URL + url,
      method: method,
      data: data,
      header: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {},
        header
      ),
      success: function(res) {
        var statusCode = res.statusCode;
        var body = res.data;
        if (statusCode === 200 && body && body.code === 0) {
          resolve(body.data);
        } else if (statusCode === 401) {
          wx.removeStorageSync('referee_token');
          wx.removeStorageSync('referee_user_info');
          var app = getApp();
          app.globalData.isRefereeCertified = false;
          app.globalData.userInfo = null;
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已过期，请重新登录'));
        } else {
          var errMsg = (body && body.message) || '请求失败(' + statusCode + ')';
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 });
          reject(body || new Error(errMsg));
        }
      },
      fail: function(err) {
        console.error('[Request] 网络请求失败:', url, err);
        wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
        reject(err);
      }
    });
  });
}

function getPaginated(url, page, pageSize) {
  pageSize = pageSize || 20;
  return _request(url, {
    method: 'GET',
    data: { page: page, pageSize: pageSize }
  });
}

// ==================== 页面数据 ====================

Page({
  data: {
    records: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    pageLoading: true,
    refreshing: false,
    filterDate: '',
    total: 0,
    selectedRecord: null,
  },

  // ==================== 生命周期 ====================

  onLoad() {
    this.loadRecords(true);
  },

  onShow() {
    // 如果从比赛页过来且可能有新记录
    if (!this.data.pageLoading) {
      this.loadRecords(true);
    }
  },

  // ==================== 数据加载 ====================

  /**
   * 加载比赛记录
   * @param reset 是否重置列表
   */
  loadRecords: function(reset) {
    var self = this;
    var page = reset ? 1 : self.data.page;

    if (!reset && this.data.loadingMore) return;

    if (!reset) {
      self.setData({ loadingMore: true });
    } else {
      self.setData({ pageLoading: true, page: page, hasMore: true });
    }

    // 构建查询参数
    var queryParams = { page: page, pageSize: self.data.pageSize };
    if (self.data.filterDate) {
      queryParams.date = self.data.filterDate;
    }

    return getPaginated(
      '/api/referee/match/results',
      page,
      self.data.pageSize
    ).then(function(res) {
      var displayRecords = self.mapToDisplay(res.list);

      self.setData({
        records: reset ? displayRecords : self.data.records.concat(displayRecords),
        page: reset ? 1 : self.data.page + 1,
        hasMore: self.data.records.length + displayRecords.length < res.total,
        total: res.total,
        pageLoading: false,
        loadingMore: false,
        refreshing: false,
      });
    }).catch(function() {
      self.setData({
        pageLoading: false,
        loadingMore: false,
        refreshing: false,
      });
      if (reset) {
        wx.showToast({ title: '加载失败，下拉重试', icon: 'none' });
      }
    });
  },

  /**
   * 将后端数据映射为展示数据
   */
  mapToDisplay: function(list) {
    var self = this;
    return list.map(function(item) {
      var status = item.status;
      var finishTimeMs = item.finishTimeMs != null ? item.finishTimeMs : (item.finish_time_ms != null ? item.finish_time_ms : null);
      return {
        id: item.id,
        rank: item.rank != null ? item.rank : null,
        nickname: item.nickname || item.userName || '未知选手',
        robotName: item.robotName || '-',
        finishTimeMs: finishTimeMs,
        scoreText: self.formatRaceTime(finishTimeMs),
        status: status,
        statusText: self.getStatusText(status),
        statusClass: self.getStatusClass(status),
        startedAt: item.startedAt || item.started_at || '',
        finishedAt: item.finishedAt || item.finished_at || '',
        durationText: self.getDurationText(
          item.startedAt || item.started_at,
          item.finishedAt || item.finished_at
        ),
      };
    });
  },

  // ==================== 日期筛选 ====================

  /**
   * 选择筛选日期
   */
  handleDateChange(e) {
    var date = e.detail.value;
    this.setData({ filterDate: date });
    this.loadRecords(true);
  },

  /**
   * 清除日期筛选
   */
  handleClearFilter() {
    this.setData({ filterDate: '' });
    this.loadRecords(true);
  },

  // ==================== 详情查看 ====================

  /**
   * 点击记录查看详情
   */
  handleRecordTap: function(e) {
    var recordId = e.currentTarget.dataset.id;
    var records = this.data.records;
    var record = null;
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === recordId) {
        record = records[i];
        break;
      }
    }
    if (record) {
      this.setData({ selectedRecord: record });
    }
  },

  /**
   * 关闭详情弹窗
   */
  handleCloseDetail() {
    this.setData({ selectedRecord: null });
  },

  // ==================== 下拉刷新 + 上拉加载 ====================

  onPullDownRefresh: function() {
    var self = this;
    self.setData({ refreshing: true });
    self.loadRecords(true).then(function() { wx.stopPullDownRefresh(); });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadRecords(false);
    }
  },

  // ==================== 格式化工具 ====================

  /**
   * 格式化比赛时间（ms → mm:ss.cc）
   */
  formatRaceTime: function(ms) {
    if (ms === null || ms === undefined) return '-';
    if (ms < 0) return '-';
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    var cs = Math.floor((ms % 1000) / 10);
    return padZero(min) + ':' + padZero(sec) + '.' + padZero(cs);
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    var map = {
      'finished': '🏁 完成',
      'timeout': '⏰ 超时',
      'fault': '🤖 故障',
      'racing': '▶️ 进行中',
    };
    return map[status] || status;
  },

  /**
   * 获取状态样式类
   */
  getStatusClass(status) {
    var map = {
      'finished': 'tag-success',
      'timeout': 'tag-warning',
      'fault': 'tag-danger',
      'racing': 'tag-info',
    };
    return map[status] || '';
  },

  /**
   * 计算比赛用时文本
   */
  getDurationText: function(startedAt, finishedAt) {
    if (!startedAt) return '-';
    if (!finishedAt) return '进行中...';
    try {
      var start = new Date(startedAt).getTime();
      var end = new Date(finishedAt).getTime();
      var diffMs = end - start;
      if (diffMs < 0) return '-';
      var seconds = Math.floor(diffMs / 1000);
      if (seconds < 60) return seconds + '秒';
      var minutes = Math.floor(seconds / 60);
      var remainSec = seconds % 60;
      return minutes + '分' + remainSec + '秒';
    } catch(e) {
      return '-';
    }
  },

  /**
   * 格式化日期时间
   */
  formatDateTime: function(iso) {
    if (!iso) return '-';
    try {
      var d = new Date(iso);
      var month = padZero(d.getMonth() + 1);
      var day = padZero(d.getDate());
      var hours = padZero(d.getHours());
      var minutes = padZero(d.getMinutes());
      return month + '-' + day + ' ' + hours + ':' + minutes;
    } catch(e) {
      return iso;
    }
  },
});
