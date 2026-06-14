// pages/profile/profile.ts
// 个人中心：个人信息、参赛记录、助力记录、优惠券列表
import { get, post, put } from '../../utils/request';
import { IUserInfo } from '../../types/app';
import { IRaceRecord, ICoupon, IProfileFormData } from '../../types/profile';
import { IHelpActivity } from '../../types/help';

interface IAppOption {
  globalData: {
    userInfo: IUserInfo | null;
    token: string | null;
    isLoggedIn: boolean;
  };
  wxLogin: () => Promise<void>;
  logout: () => void;
}

Page({
  data: {
    userInfo: null as IUserInfo | null,
    isLoggedIn: false,

    // tabs
    tabIndex: 0,
    tabs: [
      { label: '参赛记录', key: 'records' },
      { label: '助力记录', key: 'helps' },
      { label: '优惠券', key: 'coupons' },
    ],

    // 参赛记录
    raceRecords: [] as IRaceRecord[],
    recordsLoading: false,
    recordsEmpty: false,

    // 助力记录
    helpActivities: [] as IHelpActivity[],
    helpsLoading: false,
    helpsEmpty: false,

    // 优惠券
    coupons: [] as ICoupon[],
    couponsLoading: false,
    couponsEmpty: false,

    // 编辑资料
    showEditModal: false,
    editForm: {
      nickname: '',
      avatarUrl: '',
      phone: '',
      gender: 0,
    } as IProfileFormData,

    // 统计数据
    stats: {
      totalRaces: 0,
      bestScore: 0,
      rankCount: 0,
    },
  },

  onLoad() {
    this.refreshUserInfo();
  },

  onShow() {
    this.refreshUserInfo();
    // 加载当前 tab 数据
    this.loadTabData();
  },

  /**
   * 刷新用户信息
   */
  refreshUserInfo() {
    const app = getApp<IAppOption>();
    const { userInfo, isLoggedIn } = app.globalData;
    this.setData({
      userInfo,
      isLoggedIn,
    });

    if (isLoggedIn) {
      this.fetchUserStats();
    }
  },

  /**
   * 获取用户统计数据
   */
  async fetchUserStats() {
    try {
      const stats = await get<{
        totalRaces: number;
        bestScore: number;
        rankCount: number;
      }>('/player/me/stats');
      this.setData({ stats });
    } catch (error) {
      console.error('获取统计数据失败', error);
    }
  },

  /**
   * 登录
   */
  async doLogin() {
    const app = getApp<IAppOption>();
    try {
      await app.wxLogin();
      this.refreshUserInfo();
      this.loadTabData();
    } catch (error) {
      console.error('登录失败', error);
    }
  },

  /**
   * 退出登录
   */
  doLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出登录？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp<IAppOption>();
          app.logout();
          this.setData({
            isLoggedIn: false,
            userInfo: null,
            raceRecords: [],
            helpActivities: [],
            coupons: [],
          });
          wx.showToast({ title: '已退出', icon: 'success' });
        }
      },
    });
  },

  // ========== Tab 切换 ==========

  onTabChange(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.tabIndex) return;
    this.setData({ tabIndex: index });
    this.loadTabData();
  },

  /**
   * 根据当前 tab 加载数据
   */
  loadTabData() {
    const { tabIndex } = this.data;
    if (tabIndex === 0) {
      this.fetchRaceRecords();
    } else if (tabIndex === 1) {
      this.fetchHelpActivities();
    } else if (tabIndex === 2) {
      this.fetchCoupons();
    }
  },

  // ========== 参赛记录 ==========

  async fetchRaceRecords() {
    this.setData({ recordsLoading: true });
    try {
      const records = await get<IRaceRecord[]>('/player/me/race-records');
      this.setData({
        raceRecords: records || [],
        recordsLoading: false,
        recordsEmpty: !records || records.length === 0,
      });
    } catch (error) {
      console.error('获取参赛记录失败', error);
      this.setData({ recordsLoading: false });
    }
  },

  /**
   * 格式化用时
   */
  formatScore(seconds: number): string {
    if (!seconds && seconds !== 0) return '--';
    if (seconds < 60) return `${seconds.toFixed(1)}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}分${secs}秒`;
  },

  // ========== 助力记录 ==========

  async fetchHelpActivities() {
    this.setData({ helpsLoading: true });
    try {
      const activities = await get<IHelpActivity[]>('/player/me/help-activities');
      this.setData({
        helpActivities: activities || [],
        helpsLoading: false,
        helpsEmpty: !activities || activities.length === 0,
      });
    } catch (error) {
      console.error('获取助力记录失败', error);
      this.setData({ helpsLoading: false });
    }
  },

  /**
   * 跳转到助力详情页
   */
  goToHelpDetail(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: `/pages/help/help?id=${id}` });
    }
  },

  // ========== 优惠券 ==========

  async fetchCoupons() {
    this.setData({ couponsLoading: true });
    try {
      const coupons = await get<ICoupon[]>('/player/me/coupons');
      this.setData({
        coupons: coupons || [],
        couponsLoading: false,
        couponsEmpty: !coupons || coupons.length === 0,
      });
    } catch (error) {
      console.error('获取优惠券失败', error);
      this.setData({ couponsLoading: false });
    }
  },

  /**
   * 格式化优惠券金额
   */
  formatCouponValue(coupon: ICoupon): string {
    if (coupon.type === 'cash') {
      return `¥${(coupon.value / 100).toFixed(0)}`;
    }
    return `${coupon.value}折`;
  },

  /**
   * 优惠券状态标签
   */
  getCouponStatusLabel(status: string): { text: string; class: string } {
    switch (status) {
      case 'available':
        return { text: '可使用', class: 'status-available' };
      case 'used':
        return { text: '已使用', class: 'status-used' };
      case 'expired':
        return { text: '已过期', class: 'status-expired' };
      default:
        return { text: status, class: '' };
    }
  },

  // ========== 编辑资料 ==========

  /**
   * 打开编辑资料弹窗
   */
  onEditProfile() {
    const { userInfo } = this.data;
    this.setData({
      showEditModal: true,
      editForm: {
        nickname: userInfo?.nickname || '',
        avatarUrl: userInfo?.avatarUrl || '',
        phone: userInfo?.phone || '',
        gender: userInfo?.gender ?? 0,
      },
    });
  },

  /**
   * 关闭编辑弹窗
   */
  onCloseEditModal() {
    this.setData({ showEditModal: false });
  },

  /**
   * 选择头像
   */
  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'editForm.avatarUrl': e.detail.avatarUrl });
  },

  /**
   * 输入昵称
   */
  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ 'editForm.nickname': e.detail.value });
  },

  /**
   * 输入手机号
   */
  onPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ 'editForm.phone': e.detail.value });
  },

  /**
   * 提交编辑
   */
  async onSubmitProfile() {
    const { editForm } = this.data;
    if (!editForm.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });
      const updatedUser = await put<IUserInfo>('/player/me/profile', {
        nickname: editForm.nickname.trim(),
        avatarUrl: editForm.avatarUrl,
        phone: editForm.phone?.trim() || undefined,
        gender: editForm.gender,
      });
      wx.hideLoading();

      // 更新全局用户信息
      const app = getApp<IAppOption>();
      app.globalData.userInfo = updatedUser;
      wx.setStorageSync('player_user', updatedUser);

      this.setData({
        userInfo: updatedUser,
        showEditModal: false,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error: any) {
      wx.hideLoading();
      wx.showToast({ title: error?.message || '保存失败', icon: 'none' });
    }
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '来看看我在机器狗迷宫竞速的成绩！',
      path: '/pages/index/index',
    };
  },
});
