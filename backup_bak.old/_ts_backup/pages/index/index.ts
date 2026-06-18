// pages/index/index.ts
// 赛事首页：banner图文、数据概览、快捷入口
import { get, silentGet } from '../../utils/request';
import { IUserInfo } from '../../types/app';

interface HomeData {
  raceCount: number;        // 今日已参赛人数
  totalPlayers: number;     // 累计参赛玩家
  arenaName: string;        // 赛场名称
  arenaStatus: string;      // 赛场状态 open|closed
  remainCount: number;      // 剩余参赛次数
  announcements: string[];  // 赛事公告
}

Page({
  data: {
    raceCount: 0,
    totalPlayers: 0,
    arenaName: '主赛场',
    arenaStatus: 'open',
    remainCount: 0,
    announcements: [] as string[],
    loading: true,
    isLoggedIn: false,
    userInfo: null as IUserInfo | null,
  },

  onLoad() {
    this.checkAuthState();
    this.fetchHomeData();
  },

  onShow() {
    this.checkAuthState();
    this.fetchHomeData();
  },

  onPullDownRefresh() {
    this.fetchHomeData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 检查登录状态
   */
  checkAuthState() {
    const app = getApp<IAppOption>();
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn,
      userInfo: app.globalData.userInfo,
    });
  },

  /**
   * 获取首页数据
   */
  async fetchHomeData() {
    this.setData({ loading: true });
    try {
      const data = await get<HomeData>('/player/home');
      this.setData({
        raceCount: data.raceCount || 0,
        totalPlayers: data.totalPlayers || 0,
        arenaName: data.arenaName || '主赛场',
        arenaStatus: data.arenaStatus || 'closed',
        remainCount: data.remainCount || 0,
        announcements: data.announcements || [],
        loading: false,
      });
    } catch (error) {
      console.error('获取首页数据失败', error);
      this.setData({ loading: false });
    }
  },

  /**
   * 跳转参赛包购买页（tabBar 页面）
   */
  goToPackages() {
    wx.switchTab({ url: '/pages/packages/packages' });
  },

  /**
   * 跳转签到页
   */
  goToCheckin() {
    // 先检查是否登录
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    // 检查是否有剩余次数
    if (this.data.remainCount <= 0) {
      wx.showModal({
        title: '参赛次数不足',
        content: '你的参赛次数已用完，请购买参赛包或邀请好友助力获取免费次数',
        confirmText: '去购买',
        cancelText: '稍后再说',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/packages/packages' });
          }
        },
      });
      return;
    }
    wx.navigateTo({ url: '/pages/checkin/checkin' });
  },

  /**
   * 跳转榜单页（tabBar 页面）
   */
  goToLeaderboard() {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  /**
   * 跳转助力页
   */
  goToHelp() {
    if (!this.data.isLoggedIn) {
      this.promptLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/help/help' });
  },

  /**
   * 登陆提示
   */
  promptLogin() {
    wx.showModal({
      title: '请先登录',
      content: '需要登录后才能使用此功能',
      confirmText: '去登录',
      success: (res) => {
        if (res.confirm) {
          const app = getApp<IAppOption>();
          app.wxLogin().then(() => {
            this.checkAuthState();
          });
        }
      },
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '机器狗迷宫竞速大赛，等你来战！',
      path: '/pages/index/index',
      imageUrl: '/assets/images/share-banner.png',
    };
  },

  onShareTimeline() {
    return {
      title: '机器狗迷宫竞速大赛 — 速度与智慧的较量！',
      query: '',
      imageUrl: '/assets/images/share-banner.png',
    };
  },
});

// 引用 app 类型
interface IAppOption {
  globalData: {
    userInfo: IUserInfo | null;
    token: string | null;
    isLoggedIn: boolean;
    systemInfo: WechatMiniprogram.SystemInfo | null;
  };
  wxLogin: () => Promise<void>;
}
