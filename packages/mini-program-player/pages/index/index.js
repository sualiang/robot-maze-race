// pages/index/index.js - 首页（Tab1：扫码主入口）
var request = require('../../utils/request');

Page({
  data: {
    loaded: false,
    remainCount: 0,
    packages: [],
    packagesLoaded: false,
    lastRace: null,
    recommendList: [],
    showPackageSection: false,
    seasonName: '',
    levelName: '',
    expPercent: 0
  },

  /* ======== 生命周期 ======== */
  onLoad: function () {
    this.loadAllData();
  },

  onShow: function () {
    // 每次显示刷新数据（次数可能变化）
    this.loadAllData();
  },

  onPullDownRefresh: function () {
    this.loadAllData();
  },

  /* ======== 数据加载 ======== */
  loadAllData: function () {
    this.fetchUserInfo();
    this.fetchPackages();
  },

  /**
   * 获取用户信息和剩余次数
   * 模拟 /player/me/info 响应
   */
  fetchUserInfo: function () {
    var that = this;
    var app = getApp();

    // 未登录 — 用默认值显示扫码入口即可
    if (!app.globalData.isLoggedIn) {
      that.setData({
        remainCount: 0,
        lastRace: {
          id: 'mock_01',
          venueName: '未来科技城·初级赛道',
          score: '00:32.45',
          rankText: '5',
          dateText: '2026-06-16 15:20'
        },
        loaded: true
      });
      wx.stopPullDownRefresh();
      return;
    }

    // 获取赛季信息（首页顶部展示赛季名称 + 等级标签）
    request.silentGet('/season/user/info').then(function (seasonData) {
      if (seasonData) {
        var medal = seasonData.medal || {};
        var currentExp = medal.currentExp || 0;
        var nextLevelExp = medal.nextLevelExp || 100;
        var expPercent = nextLevelExp > 0 ? Math.min(100, Math.round((currentExp / nextLevelExp) * 100)) : 0;
        that.setData({
          seasonName: seasonData.seasonName || seasonData.season_name || '',
          levelName: medal.name || '',
          expPercent: expPercent
        });
      }
    }).catch(function () {
      // 赛季接口未就绪，静默跳过
    });

    // 先尝试 /player/me/profile-check 获取剩余次数，同时拉取 race-records
    request.silentGet('/player/me/profile-check').then(function (data) {
      var remain = (typeof data.race_count !== 'undefined') ? data.race_count :
                   (data.raceCount || data.ticketCount || 0);
      var hasPack = that.data.packages && that.data.packages.length > 0;
      that.setData({ remainCount: remain, showPackageSection: hasPack });
    }).catch(function () {
      // fallback
    });

    request.silentGet('/player/me/race-records', { limit: 1 }).then(function (data) {
      var list = [];
      if (Array.isArray(data)) list = data;
      else if (data && Array.isArray(data.list)) list = data.list;
      else if (data && Array.isArray(data.data)) list = data.data;
      else if (data && data.code === 0 && Array.isArray(data.data)) list = data.data;
      var last = null;
      if (list.length > 0) {
        var r = list[0];
        last = {
          id: r.id || '',
          venueName: r.venueName || r.venue_name || '未来科技城·初级赛道',
          score: r.score || r.time || '00:32.45',
          rankText: r.rankText || (r.rank || r.ranking || '5'),
          rankClass: (r.rank || r.ranking) <= 3 ? 'rank-green' : 'rank-yellow',
          timeText: r.timeText || (r.time ? r.time + 's' : '--'),
          dateText: formatRaceDate(r.date || r.createdAt)
        };
      } else {
        // Mock: 展示一条演示数据
        last = {
          id: 'mock_01',
          venueName: '未来科技城·初级赛道',
          score: '00:32.45',
          rankText: '5',
          rankClass: 'rank-yellow',
          dateText: '2026-06-16 15:20'
        };
      }
      that.setData({ lastRace: last, loaded: true });
      wx.stopPullDownRefresh();
    }).catch(function () {
      // Mock fallback
      that.setData({
        lastRace: {
          id: 'mock_01',
          venueName: '未来科技城·初级赛道',
          score: '00:32.45',
          rankText: '5',
          rankClass: 'rank-yellow',
          dateText: '2026-06-16 15:20'
        },
        loaded: true
      });
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 获取推荐参赛包
   * 模拟 /player/packages 响应
   */
  fetchPackages: function () {
    var that = this;

    request.silentGet('/player/packages').then(function (data) {
      var rawList = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && Array.isArray(data.list)) {
        rawList = data.list;
      } else if (data && data.data && Array.isArray(data.data.list)) {
        rawList = data.data.list;
      }

      var mapped = rawList.map(function (p) {
        return {
          id: p.id || p._id,
          name: p.name,
          description: p.description || '',
          salePriceText: p.salePrice ? (p.salePrice / 100).toFixed(0) : (p.price ? Number(p.price) + '' : '0'),
          originalPriceText: p.originalPrice ? (p.originalPrice / 100).toFixed(0) : '',
          isHot: p.isHot || false,
          isRecommend: p.isRecommend || false,
          times: p.race_count || (p.description ? (p.description.match(/^(\d+)/) || [0])[0] : 0) || 0,
          tag: p.isHot ? '🔥 热门' : (p.isRecommend ? '💎 推荐' : ''),
          tagType: p.isHot ? 'hot' : (p.isRecommend ? 'recommend' : '')
        };
      });

      that.setData({
        packages: mapped,
        recommendList: mapped.slice(0, 5),
        showPackageSection: mapped.length > 0,
        packagesLoaded: true
      });
    }).catch(function (err) {
      that.setData({
        packages: [],
        packagesLoaded: true,
        showPackageSection: false
      });
    });
  },

  /* ======== 事件处理 ======== */

  /**
   * 扫码参赛 — 调用 wx.scanCode
   */
  onScanCode: function () {
    var that = this;

    // 未登录提示
    if (!that.isLoggedIn()) {
      that.promptLogin();
      return;
    }

    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: function (res) {
        var result = res.result;
        if (result) {
          // 解析扫码结果：预期格式 "maze://race?roomId=xxx" 或直接传 roomId
          var roomId = that.parseScanResult(result);
          if (roomId) {
            wx.navigateTo({
              url: '/pages/checkin/checkin?roomId=' + encodeURIComponent(roomId)
            });
          } else {
            wx.showToast({
              title: '无效的参赛二维码',
              icon: 'none'
            });
          }
        }
      },
      fail: function () {
        // 用户取消扫码或失败，不处理
      }
    });
  },

  /**
   * 解析扫码结果，提取 roomId
   * 支持格式：
   *   - maze://race?roomId=xxx
   *   - https://xxx/race?roomId=xxx
   *   - 纯 roomId 字符串
   */
  parseScanResult: function (text) {
    if (!text || typeof text !== 'string') return null;

    try {
      // URL 格式
      if (text.indexOf('://') !== -1) {
        var parts = text.split('?');
        if (parts.length > 1) {
          var params = parts[1].split('&');
          for (var i = 0; i < params.length; i++) {
            var kv = params[i].split('=');
            if (kv[0] === 'roomId' || kv[0] === 'room_id' || kv[0] === 'id') {
              return decodeURIComponent(kv[1] || '');
            }
          }
        }
        return null;
      }

      // JSON 格式
      if (text.charAt(0) === '{' || text.charAt(0) === '[') {
        var obj = JSON.parse(text);
        return obj.roomId || obj.room_id || obj.id || null;
      }

      // 纯 ID 格式（24位 hex 或 UUID）
      if (/^[a-f0-9]{24}$/i.test(text) || /^[a-f0-9-]{36}$/i.test(text)) {
        return text;
      }

    } catch (e) {
      // 解析失败
    }

    return null;
  },

  /**
   * 好友助力
   */
  onTapAssist: function () {
    if (!this.isLoggedIn()) {
      this.promptLogin();
      return;
    }
    wx.navigateTo({
      url: '/pages/help/help'
    });
  },

  /**
   * 点击单个参赛包
   */
  onTapPackage: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/packages/packages?id=' + encodeURIComponent(id)
    });
  },

  /**
   * 点击参赛包
   */
  onPackageTap: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({
        url: '/pages/packages/packages?id=' + encodeURIComponent(id)
      });
    }
  },

  /**
   * 查看上次参赛记录
   */
  onViewRecord: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({
        url: '/pages/race/race?recordId=' + encodeURIComponent(id)
      });
    }
  },

  /**
   * 查看全部参赛包
   */
  onViewAllPackages: function () {
    wx.navigateTo({
      url: '/pages/packages/packages'
    });
  },

  /* ======== 工具方法 ======== */

  isLoggedIn: function () {
    var app = getApp();
    return !!app.globalData.isLoggedIn;
  },

  promptLogin: function () {
    var that = this;
    wx.showModal({
      title: '提示',
      content: '请先登录后再参赛',
      cancelText: '稍后',
      success: function (res) {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
});

/* ======== 工具函数 ======== */

/**
 * 格式化参赛日期
 */
function formatRaceDate(dateInput) {
  if (!dateInput) return '';
  try {
    var d = typeof dateInput === 'number' ? new Date(dateInput)
      : typeof dateInput === 'string' ? new Date(dateInput)
      : dateInput;
    if (isNaN(d.getTime())) return '';
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var hours = d.getHours();
    var min = d.getMinutes();
    return (month < 10 ? '0' : '') + month + '/' + (day < 10 ? '0' : '') + day
      + ' ' + (hours < 10 ? '0' : '') + hours + ':' + (min < 10 ? '0' : '') + min;
  } catch (e) {
    return '';
  }
}
