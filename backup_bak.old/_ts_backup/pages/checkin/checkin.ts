// pages/checkin/checkin.ts
// 签到排队页：扫码 → 校验次数 → 信息填写 → 排队入列 → 状态展示
import { get, post, silentGet } from '../../utils/request';
import { ICheckinRecord, IQueueInfo, IArena, CheckinStatus } from '../../types/checkin';

interface IUserInfo {
  id: string;
  nickname: string;
  avatarUrl: string;
  phone?: string;
}

interface IAppOption {
  globalData: {
    userInfo: IUserInfo | null;
    token: string | null;
    isLoggedIn: boolean;
  };
  wxLogin: () => Promise<void>;
}

Page({
  data: {
    // 签到状态机
    checkinStatus: 'idle' as CheckinStatus, // idle → checking → checked/queuing → racing → finished

    // 排队信息
    queueInfo: null as IQueueInfo | null,
    checkinRecord: null as ICheckinRecord | null,
    arenaInfo: null as IArena | null,

    // 扫码
    checkinCode: '',
    errorMessage: '',

    // 用户信息（用于首次填写）
    userNickname: '',
    userAvatarUrl: '',
    userPhone: '',

    // 状态
    loading: false,
    needFillInfo: false, // 是否需要填写个人信息
  },

  onLoad() {
    this.checkExistingCheckin();
  },

  /**
   * 检查是否有进行中的签到/排队
   */
  async checkExistingCheckin() {
    try {
      const record = await silentGet<ICheckinRecord | null>('/player/checkin/current');
      if (record) {
        this.setData({
          checkinRecord: record,
          checkinStatus: record.status,
        });

        // 如果正在排队，获取排队信息
        if (record.status === 'queuing') {
          this.fetchQueueStatus();
        }
      }
    } catch (error) {
      console.error('检查签到状态失败', error);
    }
  },

  /**
   * 扫码签到
   */
  onScanCode() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (res) => {
        const code = res.result;
        this.setData({ checkinCode: code });
        this.doCheckin(code);
      },
      fail: (err) => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
        }
      },
    });
  },

  /**
   * 执行签到流程
   * ① 解析二维码 → ② 校验赛场状态 → ③ 校验参赛次数 → ④ 检查个人信息 → ⑤ 排队入列
   */
  async doCheckin(code: string) {
    this.setData({ loading: true, errorMessage: '', checkinStatus: 'checking' });

    try {
      // ① 解析赛场码并校验
      const arena = await post<IArena>('/player/checkin/validate', { code });

      // ② 检查用户是否已完善个人信息
      const userInfo = await silentGet<{ needPhone: boolean }>('/player/me/profile-check');
      if (userInfo?.needPhone) {
        this.setData({ loading: false, needFillInfo: true, arenaInfo: arena });
        wx.showToast({ title: '请先完善个人信息', icon: 'none', duration: 2000 });
        return;
      }

      // ③ 执行签到 → 入列
      await this.submitCheckin(code);
    } catch (error: any) {
      const msg = error?.message || '签到失败，请重试';
      this.setData({
        loading: false,
        checkinStatus: 'idle',
        errorMessage: msg,
      });
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
    }
  },

  /**
   * 提交个人信息后完成签到
   */
  async submitProfileAndCheckin() {
    const { userNickname, userPhone, userAvatarUrl, checkinCode } = this.data;

    if (!userNickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ loading: true, needFillInfo: false });

    try {
      // 更新个人信息
      await post('/player/me/profile', {
        nickname: userNickname.trim(),
        phone: userPhone.trim(),
        avatarUrl: userAvatarUrl,
      });

      // 执行签到
      await this.submitCheckin(checkinCode);
    } catch (error: any) {
      this.setData({ loading: false });
      wx.showToast({ title: error?.message || '操作失败', icon: 'none' });
    }
  },

  /**
   * 最终提交签到
   */
  async submitCheckin(code: string) {
    const record = await post<ICheckinRecord>('/player/checkin', { code });

    this.setData({
      checkinRecord: record,
      checkinStatus: record.status,
      loading: false,
    });

    if (record.status === 'queuing') {
      this.fetchQueueStatus();
    }
  },

  /**
   * 获取实时排队状态
   */
  async fetchQueueStatus() {
    try {
      const queueInfo = await get<IQueueInfo>('/player/checkin/queue');
      this.setData({
        queueInfo,
        checkinStatus: queueInfo.status,
      });
    } catch (error) {
      console.error('获取排队状态失败', error);
    }
  },

  /**
   * 刷新排队状态
   */
  onRefreshQueue() {
    this.fetchQueueStatus();
  },

  /**
   * 自动轮询排队状态（每 5 秒）
   */
  startPolling() {
    (this as any)._pollTimer = setInterval(() => {
      if (this.data.checkinStatus === 'queuing') {
        this.fetchQueueStatus();
      }
    }, 5000);
  },

  onHide() {
    // 离开页面时停止轮询
    if ((this as any)._pollTimer) {
      clearInterval((this as any)._pollTimer);
      (this as any)._pollTimer = null;
    }
  },

  onUnload() {
    if ((this as any)._pollTimer) {
      clearInterval((this as any)._pollTimer);
    }
  },

  /**
   * 选择头像（微信新版 API）
   */
  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const { avatarUrl } = e.detail;
    this.setData({ userAvatarUrl: avatarUrl });
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ userNickname: e.detail.value });
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ userPhone: e.detail.value });
  },

  /**
   * 查看成绩
   */
  goToLeaderboard() {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '我正在排队参加机器狗迷宫竞速！',
      path: '/pages/index/index',
    };
  },
});
