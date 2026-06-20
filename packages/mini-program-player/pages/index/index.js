// pages/index/index.js - 首页（V2重构版）
// 模块1: 顶部导航栏 | 模块2: 主视觉Banner | 模块3: 参赛状态&福利总览卡
// 模块4: 今日专属福利条 | 模块5: 参赛包推荐区 | 模块6: 赛季竞技入口卡片
var request = require('../../utils/request');

Page({
  data: {
    // 通用状态
    loaded: false,
    // 模块1: 导航栏
    venueName: '',  // 上次扫码赛场名, 从微信缓存取
    couponCount: 0,
    // 模块2: Banner
    remainCount: 0,
    // 模块3: 参赛状态&福利
    couponValue: 0,
    // 模块4: 福利条
    promoText: '🔥 今日专属：买任意参赛包，额外赠15元奶茶无门槛券',
    // 模块5: 参赛包
    packages: [],
    packagesLoaded: false,
    // 模块6: 赛季竞技
    seasonName: '',
    seasonEndDays: 0,
    userRank: 0
  },

  /* ======== 生命周期 ======== */
  onLoad: function () {
    this.loadAllData();
  },

  onShow: function () {
    this.loadAllData();
  },

  onPullDownRefresh: function () {
    this.loadAllData().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  /* ======== 数据加载 ======== */
  loadAllData: function () {
    var that = this;

    // 读本地存储的赛场名（扫码入场时存储）
    // 占位 — 赛场名称此前保留为将来扩展

    // 并行拉取所有数据
    that.fetchUserProfile();
    that.fetchCoupons();
    that.fetchPackages();
    that.fetchSeasonUserInfo();
    that.fetchSeasonConfig();

    return Promise.resolve();
  },

  /**
   * 获取用户信息 /api/v1/player/me/profile
   */
  fetchUserProfile: function () {
    var that = this;
    var app = getApp();

    if (!app.globalData.isLoggedIn) {
      that.setData({
        remainCount: 0,
        loaded: true
      });
      return;
    }

    request.silentGet('/player/me/profile').then(function (data) {
      var remain = (typeof data.race_count !== 'undefined') ? data.race_count :
                   (data.raceCount || data.remainCount || 0);
      that.setData({ remainCount: remain });
    }).catch(function () {
      // fallback: 尝试旧的 profile-check 接口
      request.silentGet('/player/me/profile-check').then(function (data) {
        var remain = (typeof data.race_count !== 'undefined') ? data.race_count :
                     (data.raceCount || data.ticketCount || 0);
        that.setData({ remainCount: remain });
      }).catch(function () {
        // 静默失败，使用默认值
      });
    });
  },

  /**
   * 获取卡包信息 /api/v1/player/coupons
   */
  fetchCoupons: function () {
    var that = this;
    var app = getApp();

    if (!app.globalData.isLoggedIn) {
      that.setData({ couponCount: 0, couponValue: 0 });
      return;
    }

    request.silentGet('/player/coupons', { status: 0 }).then(function (data) {
      var list = [];
      var totalValue = 0;

      if (Array.isArray(data)) {
        list = data;
      } else if (data && Array.isArray(data.list)) {
        list = data.list;
      } else if (data && data.data && Array.isArray(data.data.list)) {
        list = data.data.list;
      }

      // 计算券数量和总价值
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.value) totalValue += Number(c.value);
        else if (c.amount) totalValue += Number(c.amount);
        else if (c.denomination) totalValue += Number(c.denomination);
      }

      that.setData({
        couponCount: list.length,
        couponValue: totalValue
      });
    }).catch(function () {
      // 静默失败
    });
  },

  /**
   * 获取参赛包列表 /api/v1/player/packages
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
          salePriceFen: p.price || 0,
          salePriceText: ((p.price || 0) / 100).toFixed(2).replace(/\.?0+$/, ''),
          standardPriceText: p.standardPriceCents ? (p.standardPriceCents / 100).toFixed(2).replace(/\.?0+$/, '') : '',
          isHot: p.isHot || false,
          isRecommend: p.isRecommend || false,
          times: p.raceCount || 0,
          tag: p.tag || (p.isHot ? '🔥 热门' : (p.isRecommend ? '💎 推荐' : '')),
        };
      });

      that.setData({
        packages: mapped,
        packagesLoaded: true
      });
    }).catch(function () {
      that.setData({
        packages: [],
        packagesLoaded: true
      });
    });
  },

  /**
   * 获取赛季用户信息 /api/v1/season/user/info
   */
  fetchSeasonUserInfo: function () {
    var that = this;
    var app = getApp();

    if (!app.globalData.isLoggedIn) return;

    request.silentGet('/season/user/info').then(function (data) {
      var rank = data.rank || data.ranking || 0;
      that.setData({
        seasonName: data.seasonName || data.season_name || '',
        userRank: rank
      });
    }).catch(function () {
      // 静默失败
    });
  },

  /**
   * 获取赛季配置 /api/v1/season/config
   */
  fetchSeasonConfig: function () {
    var that = this;

    request.silentGet('/season/config').then(function (data) {
      if (data && (data.cycleEnd || data.endDate)) {
        var endStr = data.cycleEnd || data.endDate;
        var endTime = new Date(endStr).getTime();
        var now = Date.now();
        var daysLeft = Math.max(0, Math.ceil((endTime - now) / (1000 * 60 * 60 * 24)));
        that.setData({ seasonEndDays: daysLeft });
      }
    }).catch(function () {
      // 静默失败
    });
  },

  /* ======== 事件处理 ======== */

  /**
   * 扫码参赛
   */
  onScan: function () {
    var that = this;

    if (!that.isLoggedIn()) {
      that.promptLogin();
      return;
    }

    if (that.data.remainCount <= 0) {
      wx.showToast({
        title: '参赛次数不足，请先购买参赛包',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: function (res) {
        var result = res.result;
        if (result) {
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
        // 用户取消扫码，不做处理
      }
    });
  },

  /**
   * 跳转卡包页
   */
  onGoCoupon: function () {
    wx.navigateTo({
      url: '/pages/coupon/coupon'
    });
  },

  /**
   * 跳转卡包页（福利总览区域点击）
   */
  onGoCouponFromBenefits: function () {
    wx.navigateTo({
      url: '/pages/coupon/coupon'
    });
  },

  /**
   * 滚动到参赛包区域
   */
  onScrollToPackages: function () {
    // 使用页面滚动到参赛包推荐区域
    var query = wx.createSelectorQuery();
    query.select('#packages-section').boundingClientRect(function (rect) {
      if (rect && rect.top > 0) {
        wx.pageScrollTo({
          scrollTop: rect.top - 20,
          duration: 300
        });
      }
    }).exec();
  },

  /**
   * 立即购买参赛包
   */
  onBuyPackage: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var index = e.currentTarget.dataset.index;

    if (!that.isLoggedIn()) {
      that.promptLogin();
      return;
    }

    var pkg = that.data.packages[index];
    if (!pkg) return;

    // 调起微信支付下单
    wx.showLoading({ title: '下单中...', mask: true });

    request.post('/player/orders', {
      packageId: id,
      channel: 'wx_mini'
    }).then(function (orderData) {
      wx.hideLoading();

      var payParams = orderData.payParams || orderData.payment || orderData;
      if (payParams && payParams.package) {
        // 微信支付调起
        wx.requestPayment({
          timeStamp: payParams.timeStamp || payParams.timestamp || '',
          nonceStr: payParams.nonceStr || '',
          package: payParams.package || '',
          signType: payParams.signType || 'MD5',
          paySign: payParams.paySign || payParams.sign || '',
          success: function () {
            wx.showToast({ title: '购买成功', icon: 'success' });
            that.loadAllData();
          },
          fail: function (err) {
            if (err.errMsg.indexOf('cancel') === -1) {
              wx.showToast({ title: '支付失败', icon: 'none' });
            }
          }
        });
      } else {
        wx.showToast({ title: '下单成功', icon: 'success' });
        that.loadAllData();
      }
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: '下单失败，请重试', icon: 'none' });
    });
  },

  /**
   * 查看全部参赛包
   */
  onViewAllPackages: function () {
    wx.navigateTo({
      url: '/pages/packages/packages'
    });
  },

  /**
   * 跳转排行榜页
   */
  onGoLeaderboard: function () {
    wx.navigateTo({
      url: '/pages/leaderboard/leaderboard'
    });
  },

  /* ======== 工具方法 ======== */

  isLoggedIn: function () {
    var app = getApp();
    return !!app.globalData.isLoggedIn;
  },

  promptLogin: function () {
    wx.showModal({
      title: '提示',
      content: '请先登录后再操作',
      cancelText: '稍后',
      success: function (res) {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  /**
   * 解析扫码结果，提取 roomId
   */
  parseScanResult: function (text) {
    if (!text || typeof text !== 'string') return null;

    try {
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

      if (text.charAt(0) === '{' || text.charAt(0) === '[') {
        var obj = JSON.parse(text);
        return obj.roomId || obj.room_id || obj.id || null;
      }

      if (/^[a-f0-9]{24}$/i.test(text) || /^[a-f0-9-]{36}$/i.test(text)) {
        return text;
      }

    } catch (e) {}

    return null;
  }
});
