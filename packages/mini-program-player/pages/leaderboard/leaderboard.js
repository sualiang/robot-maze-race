/**
 * pages/leaderboard/leaderboard.js - 排行榜 V2 重做
 * 设计基准: 750rpx
 * 接口:
 *   GET /api/v1/season/user/info       — 用户赛季信息(含我的排名)
 *   GET /api/v1/rank/daily|weekly|total — 榜单数据
 *   GET /api/v1/season/config           — 赛季配置(规则弹窗用)
 */

var request = require('../../utils/request');
var app = getApp();

// 赛季配置缓存(规则弹窗用)
var seasonConfigCache = null;

Page({
  data: {
    pageLoading: true,

    // 模块1: 规则弹窗
    showRules: false,
    ruleContent: {
      rankingRule: '取本赛季单局最佳成绩排序，用时越短排名越高',
      seasonCycle: '由运营商设定',
      finalReward: '前3名颁奖牌证书+机器狗模型；前20名获专属权益包',
      disclaimer: '最终解释权归主办方所有'
    },

    // 模块2: 我的排名卡片
    myRanking: null,
    // 距决赛入围还差X名
    gapToFinal: null,
    // 再玩X局有望晋级
    racesToAdvance: null,

    // 模块3: Tab
    currentTab: 'weekly',
    tabs: [
      { key: 'daily', label: '日榜' },
      { key: 'weekly', label: '周榜' },
      { key: 'total', label: '总榜' }
    ],

    // 模块4: 榜单列表
    entries: [],
    listLoading: true,
    hasMore: true,
    page: 1,

    // 我的用户ID(用于标记高亮)
    myUserId: ''
  },

  /* ==================== 生命周期 ==================== */

  onLoad: function () {
    var that = this;
    that.setData({ pageLoading: true });

    // 获取用户信息
    var userInfo = wx.getStorageSync('player_user');
    if (userInfo && userInfo.id) {
      that.setData({ myUserId: userInfo.id });
    }

    // 并行加载赛季配置 + 用户赛季信息 + 榜单
    Promise.all([
      that._loadSeasonConfig(),
      that._loadMyRanking(),
      that._loadRankList('weekly', 1)
    ]).catch(function (err) {
      console.error('排行榜页加载异常:', err);
    }).finally(function () {
      that.setData({ pageLoading: false });
    });
  },

  onShow: function () {
    // Tab 间切换刷新
    if (!this.data.pageLoading && this.data.entries.length > 0) {
      this._loadRankList(this.data.currentTab, 1);
      this._loadMyRanking();
    }
  },

  /* ==================== 数据加载 ==================== */

  /**
   * 获取赛季配置(仅首次加载,缓存)
   */
  _loadSeasonConfig: function () {
    var that = this;
    if (seasonConfigCache) {
      that.setData({
        'ruleContent.seasonCycle': seasonConfigCache.seasonCycle || '由运营商设定'
      });
      return Promise.resolve();
    }
    return request.silentGet('/season/config').then(function (res) {
      seasonConfigCache = res || {};
      that.setData({
        'ruleContent.seasonCycle': (res && res.seasonCycle) || '由运营商设定'
      });
    }).catch(function () {
      // 使用默认值
    });
  },

  /**
   * 获取"我的排名"数据
   */
  _loadMyRanking: function () {
    var that = this;
    return request.silentGet('/season/user/info').then(function (res) {
      if (!res) return;

      var myRanking = {
        rank: res.rank || res.myRank || '-',
        bestScore: res.bestScore || '--',
        races: res.races || res.totalRaces || 0,
        beatPercent: res.beatPercent || 0
      };

      // 计算距决赛入围的差距
      var gap = null;
      var racesToAdvance = null;
      if (myRanking.rank && myRanking.rank !== '-') {
        gap = Math.max(0, 20 - myRanking.rank);
        // 估算需要再玩的局数：每玩一局按平均提升 0.5 名估算
        racesToAdvance = Math.ceil(gap / 0.5);
        if (racesToAdvance < 1) racesToAdvance = 1;
        // 如果已经在前 20 名，不显示底部提示
        if (gap === 0) {
          gap = null;
          racesToAdvance = null;
        }
      }

      that.setData({
        myRanking: myRanking,
        gapToFinal: gap,
        racesToAdvance: racesToAdvance
      });
    }).catch(function () {
      // 用户信息不可用时保持默认状态
    });
  },

  /**
   * 加载榜单数据
   */
  _loadRankList: function (tabKey, pageNum) {
    var that = this;
    that.setData({ listLoading: pageNum === 1 });

    var endpoint;
    if (tabKey === 'daily') endpoint = '/rank/daily';
    else if (tabKey === 'weekly') endpoint = '/rank/weekly';
    else endpoint = '/rank/total';

    return request.silentGet(endpoint, {
      page: pageNum,
      pageSize: 20
    }).then(function (res) {
      var list = (res && res.list) || [];
      var myEntry = null;

      // 标记用户自身条目
      var myUserId = that.data.myUserId;
      list = list.map(function (item) {
        item.isMe = item.userId && myUserId && item.userId === myUserId;
        if (item.isMe) myEntry = item;
        return item;
      });

      // 如果自身不在榜单中但已知排名，加到底部
      if (!list.some(function (item) { return item.isMe; })) {
        var myRank = that.data.myRanking;
        if (myRank && myRank.rank && myRank.rank !== '-' && pageNum === 1) {
          // 创建一个占位条目放在列表末尾
          // 用户自己作为单独条目处理
        }
      }

      if (pageNum === 1) {
        that.setData({
          entries: list,
          page: 1,
          hasMore: list.length >= 20,
          listLoading: false
        });
      } else {
        that.setData({
          entries: that.data.entries.concat(list),
          page: pageNum,
          hasMore: list.length >= 20,
          listLoading: false
        });
      }
    }).catch(function () {
      // 接口未就绪时降级为 Mock 数据
      if (pageNum === 1) {
        that._mockRankData(tabKey);
      }
    });
  },

  /**
   * Mock 数据(用于开发和接口降级)
   */
  _mockRankData: function (tabKey) {
    var that = this;
    var mockEntries = [];
    var myUserId = that.data.myUserId;

    // 生成 30 条模拟数据
    for (var i = 0; i < 30; i++) {
      var rank = i + 1;
      var isMe = rank === 5;
      var score = (10 + Math.random() * 35).toFixed(1) + 's';
      mockEntries.push({
        userId: 'mock_user_' + rank,
        rank: rank,
        nickname: isMe ? '我' : '选手' + rank,
        avatar: '',
        score: score,
        isMe: isMe
      });
    }

    // 确保我的排名卡片可见
    that.setData({
      myRanking: that.data.myRanking || {
        rank: 5,
        bestScore: '38.1s',
        races: 3,
        beatPercent: 92
      },
      gapToFinal: that.data.gapToFinal || 15,
      racesToAdvance: that.data.racesToAdvance || 30,
      entries: mockEntries,
      hasMore: false,
      listLoading: false
    });
  },

  /* ==================== 交互事件 ==================== */

  /**
   * 切换 Tab(日/周/总榜)
   */
  onTabChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.currentTab) return;
    this.setData({ currentTab: key });
    this._loadRankList(key, 1);
  },

  /**
   * 打开规则弹窗
   */
  onOpenRules: function () {
    this.setData({ showRules: true });
  },

  /**
   * 关闭规则弹窗
   */
  onCloseRules: function () {
    this.setData({ showRules: false });
  },

  /**
   * 加载更多(触底)
   */
  onLoadMore: function () {
    if (!this.data.hasMore || this.data.listLoading) return;
    this._loadRankList(this.data.currentTab, this.data.page + 1);
  },

  /**
   * 触底事件
   */
  onReachBottom: function () {
    this.onLoadMore();
  }
});
