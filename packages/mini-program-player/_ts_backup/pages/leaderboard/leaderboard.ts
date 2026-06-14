// pages/leaderboard/leaderboard.ts
// 排行榜：日/月/年三级 tab 切换、榜单列表、高亮自己排名
import { get } from '../../utils/request';
import {
  ILeaderboardEntry,
  IMyRanking,
  LeaderboardType,
  ILeaderboardData,
} from '../../types/leaderboard';

Page({
  data: {
    // 当前选中的 tab 索引
    tabIndex: 0,
    tabs: [
      { label: '日榜', value: 'daily' as LeaderboardType },
      { label: '月榜', value: 'monthly' as LeaderboardType },
      { label: '年榜', value: 'yearly' as LeaderboardType },
    ],

    // 榜单数据
    entries: [] as ILeaderboardEntry[],
    myRanking: null as IMyRanking | null,

    // 状态
    loading: true,
    empty: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
  },

  onLoad() {
    this.loadLeaderboard('daily');
  },

  /**
   * tab 切换
   */
  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.tabIndex) return;

    const type = this.data.tabs[index]?.value || 'daily';
    this.setData({
      tabIndex: index,
      entries: [],
      page: 1,
      hasMore: true,
    });
    this.loadLeaderboard(type);
  },

  /**
   * 加载排行榜数据
   */
  async loadLeaderboard(type: LeaderboardType) {
    this.setData({ loading: true, empty: false });

    try {
      const data = await get<ILeaderboardData>('/player/leaderboard', {
        type,
        page: this.data.page,
        pageSize: this.data.pageSize,
      });

      const { entries, myRanking } = data;

      this.setData({
        entries: entries || [],
        myRanking: myRanking || null,
        loading: false,
        empty: !entries || entries.length === 0,
        hasMore: entries ? entries.length >= this.data.pageSize : false,
      });
    } catch (error) {
      console.error('加载排行榜失败', error);
      this.setData({ loading: false });
    }
  },

  /**
   * 加载更多（滚动到底部）
   */
  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return;

    const page = this.data.page + 1;
    const type = this.data.tabs[this.data.tabIndex].value;
    this.setData({ page });

    get<ILeaderboardEntry[]>('/player/leaderboard', {
      type,
      page,
      pageSize: this.data.pageSize,
    })
      .then((newEntries) => {
        if (newEntries && newEntries.length > 0) {
          this.setData({
            entries: [...this.data.entries, ...newEntries],
            hasMore: newEntries.length >= this.data.pageSize,
          });
        } else {
          this.setData({ hasMore: false });
        }
      })
      .catch((error) => {
        console.error('加载更多失败', error);
        this.setData({ page: page - 1 });
      });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    const type = this.data.tabs[this.data.tabIndex].value;
    this.setData({ page: 1, entries: [] });
    this.loadLeaderboard(type).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 格式化用时（秒 → mm:ss 或 ss.ms）
   */
  formatScore(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}秒`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}分${secs}秒`;
  },

  /**
   * 获取排名样式（前三名特殊标识）
   */
  getRankClass(rank: number): string {
    if (rank === 1) return 'rank-first';
    if (rank === 2) return 'rank-second';
    if (rank === 3) return 'rank-third';
    return '';
  },

  /**
   * 获取排名图标
   */
  getRankIcon(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return String(rank);
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '机器狗迷宫竞速排行榜，看看你能排第几？',
      path: '/pages/leaderboard/leaderboard',
    };
  },
});
