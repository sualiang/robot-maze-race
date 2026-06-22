// 个人中心 V2.0 - 完整重构
// 模块：用户信息 | 赛季段位 | 福利资产 | 赛季数据 | 功能入口 | 退出登录
var request = require('../../utils/request');
var storage = require('../../utils/storage');
var app = getApp();

Page({
  data: {
    // 模块1: 用户信息
    userInfo: {},

    // 模块2: 赛季段位
    seasonClosed: false,
    medalInfo: {
      level: 1,
      levelName: '青铜选手',
      currentExp: 0,
      nextLevelExp: 100,
      rank: 0,
      expPercent: 0,
      upgradeDesc: '升级白银立得：5元无门槛参赛抵价券 + 50积分'
    },

    // 模块3: 福利资产
    assets: {
      deductible: 0,    // 参赛抵扣卡
      couponCount: 0,   // 券数量
      couponTotal: 0    // 券总价值
    },

    // 模块4: 赛季数据
    seasonStats: {
      totalRaces: 0,
      bestTime: '--',
      totalPoints: 0
    },

    // 模块5: 功能入口
    menuList: [
      { key: 'order', icon: '📋', label: '我的订单', url: '/pages/orders/orders', rightText: '' },
      { key: 'coupon', icon: '🎫', label: '我的卡券', url: '/pages/coupon/coupon', rightText: '' },
      { key: 'exchange', icon: '🎁', label: '积分兑换', url: '/pages/points-shop/points-shop', rightText: '' },
    ]
  },

  onShow: function () {
    this.loadData();
  },

  onPullDownRefresh: function () {
    this.loadData();
  },

  loadData: function () {
    var that = this;

    // 从缓存取基本信息
    var user = storage.getSync(storage.STORAGE_KEYS.USER, {});
    that.setData({ userInfo: user });

    // 1. GET /api/v1/player/me/profile - 用户信息
    request.silentGet('/player/me/profile').then(function (res) {
      if (res) {
        var profileData = res.code === 0 && res.data ? res.data : res;
        // 补全驼峰→蛇形字段映射，避免覆盖本地缓存中的蛇形字段
        if (profileData.avatarUrl && !profileData.avatar_url) {
          profileData.avatar_url = profileData.avatarUrl;
        }
        if (profileData.raceCount && !profileData.race_count) {
          profileData.race_count = profileData.raceCount;
        }
        var merged = Object.assign({}, that.data.userInfo, profileData);
        that.setData({ userInfo: merged });
        storage.setSync(storage.STORAGE_KEYS.USER, merged);
      }
    }).catch(function () {});

    // 2. 统一从 profile-check 获取所有汇总数据
    request.silentGet('/player/me/profile-check').then(function (res) {
      var d = res.data || res;
      var balance = d.pointsBalance || 0;

      that.setData({
        assets: {
          deductible: (d.availableDeductionCents || 0) / 100,
          couponCount: 0,
          couponTotal: d.couponTotalYuan || 0
        },
        'menuList[2].rightText': '当前' + balance + '积分',
        'userInfo.points': balance
      });
    }).catch(function () {});

    // 3. GET /api/v1/season/user/info - 段位/排名/成长值
    request.silentGet('/season/user/info').then(function (res) {
      if (res) {
        var currentExp = res.exp || res.currentExp || res.current_exp || 0;
        var nextLevelExp = res.nextLevelExp || res.next_level_exp || 200;
        var expPercent = nextLevelExp > 0 ? Math.min(100, Math.round((currentExp / nextLevelExp) * 100)) : 0;

        var level = res.level || 1;
        that.setData({
          medalInfo: {
            level: level,
            levelName: res.levelName || res.level_name || '青铜选手',
            currentExp: currentExp,
            nextLevelExp: nextLevelExp,
            rank: res.rank || res.rank_number || 0,
            expPercent: expPercent,
            upgradeDesc: res.upgradeDesc || res.upgrade_desc || '升级白银立得：5元无门槛参赛抵价券 + 50积分'
          },
        });
      }
    }).catch(function (err) {
      if (err && (err.code === 403 || err.statusCode === 403)) {
        that.setData({ seasonClosed: true });
      }
    });

    wx.stopPullDownRefresh();
  },

  // 跳转编辑资料
  onEditProfile: function () {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
  },

  // 去升级 → 跳转首页参赛包区域
  onUpgrade: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 跳转卡券页（消费券 → Tab 1 立减券）
  onAssetsTap: function () {
    wx.navigateTo({ url: '/pages/coupon/coupon?tab=1' });
  },

  // 功能入口点击
  onMenuItemTap: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url: url });
    }
  },

  // 退出登录
  onLogout: function () {
    var that = this;
    wx.showModal({
      title: '退出登录',
      content: '确定退出登录吗？',
      success: function (res) {
        if (res.confirm) {
          var auth = require('../../utils/auth');
          auth.logout();
          wx.redirectTo({ url: '/pages/login/login' });
        }
      }
    });
  }
});
