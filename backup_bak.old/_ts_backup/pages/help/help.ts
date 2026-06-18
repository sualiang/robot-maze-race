// pages/help/help.ts
// 好友助力裂变页：canvas 分享卡片生成、助力状态、助力按钮
import { get, post, silentGet } from '../../utils/request';
import { IHelpActivity, IHelpRecord, IShareInfo, HelpStatus } from '../../types/help';

interface IAppOption {
  globalData: {
    userInfo: { id: string; nickname: string; avatarUrl: string; } | null;
    isLoggedIn: boolean;
  };
  wxLogin: () => Promise<void>;
}

Page({
  data: {
    // 助力活动
    activity: null as IHelpActivity | null,
    helpId: '',
    loading: true,
    isInitiator: false,  // 当前用户是否是发起者
    isHelper: false,     // 当前用户是否是助力者(来帮好友助力的)
    canHelp: true,       // 是否还可以助力

    // 分享卡片 canvas
    canvasWidth: 600,
    canvasHeight: 800,
    shareCardReady: false,
  },

  onLoad(options: { id?: string }) {
    if (options.id) {
      this.setData({ helpId: options.id });
      this.loadHelpDetail(options.id);
    } else {
      // 没有 id → 创建新的助力活动
      this.createHelpActivity();
    }
  },

  /**
   * 加载助力详情
   */
  async loadHelpDetail(id: string) {
    this.setData({ loading: true });

    try {
      const data = await get<{
        activity: IHelpActivity;
        isInitiator: boolean;
        isHelper: boolean;
        canHelp: boolean;
      }>('/player/help/detail', { helpId: id });

      this.setData({
        activity: data.activity,
        isInitiator: data.isInitiator,
        isHelper: data.isHelper,
        canHelp: data.canHelp,
        loading: false,
      });

      // 如果是发起者，预生成分享卡片
      if (data.isInitiator) {
        setTimeout(() => this.generateShareCard(), 500);
      }
    } catch (error: any) {
      console.error('获取助力详情失败', error);
      this.setData({ loading: false });
      wx.showToast({ title: error?.message || '获取数据失败', icon: 'none' });
    }
  },

  /**
   * 创建新的助力活动
   */
  async createHelpActivity() {
    this.setData({ loading: true });

    try {
      const activity = await post<IHelpActivity>('/player/help/create', {
        targetPackageId: '', // 后端可选，或前端选择目标参赛包
      });

      this.setData({
        activity,
        helpId: activity.id,
        isInitiator: true,
        loading: false,
      });

      // 预生成分享卡片
      setTimeout(() => this.generateShareCard(), 500);
    } catch (error: any) {
      console.error('创建助力失败', error);
      this.setData({ loading: false });
      wx.showToast({ title: error?.message || '创建失败', icon: 'none' });
    }
  },

  /**
   * 为好友助力
   */
  async onDoHelp() {
    const app = getApp<IAppOption>();

    if (!app.globalData.isLoggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '登录后可以为好友助力',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            app.wxLogin().then(() => {
              this.onDoHelp();
            });
          }
        },
      });
      return;
    }

    try {
      wx.showLoading({ title: '助力中...' });
      await post('/player/help/assist', { helpId: this.data.helpId });
      wx.hideLoading();
      wx.showToast({ title: '助力成功！', icon: 'success' });

      // 刷新状态
      this.loadHelpDetail(this.data.helpId);
    } catch (error: any) {
      wx.hideLoading();
      wx.showToast({ title: error?.message || '助力失败', icon: 'none' });
    }
  },

  /**
   * Canvas 生成分享卡片
   * 组合：背景图 + 头像 + 昵称 + 二维码 + 文案
   */
  generateShareCard() {
    const { activity, helpId } = this.data;
    if (!activity || !helpId) return;

    const app = getApp<IAppOption>();
    const user = app.globalData.userInfo;
    if (!user) return;

    const ctx = wx.createCanvasContext('shareCanvas', this);
    const W = this.data.canvasWidth;
    const H = this.data.canvasHeight;

    // ① 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.setFillStyle(gradient);
    ctx.fillRect(0, 0, W, H);

    // ② 顶部装饰圆
    ctx.setFillStyle('rgba(233,69,96,0.15)');
    ctx.beginPath();
    ctx.arc(W / 2, 80, 160, 0, 2 * Math.PI);
    ctx.fill();

    // ③ 标题
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(40);
    ctx.setTextAlign('center');
    ctx.fillText('机器狗迷宫竞速', W / 2, 140);
    ctx.setFontSize(28);
    ctx.setFillStyle('rgba(255,255,255,0.7)');
    ctx.fillText('好友助力 · 免费获取参赛次数', W / 2, 185);

    // ④ 发起者信息区
    const avatarY = 250;
    // 头像（圆形裁剪）
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, avatarY, 50, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    // 先绘制头像占位，实际项目中下载图片
    this.drawAvatarImage(ctx, user.avatarUrl, W / 2 - 50, avatarY - 50, 100, 100, () => {
      ctx.restore();
      ctx.draw();
    });

    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(32);
    ctx.setTextAlign('center');
    ctx.fillText(user.nickname, W / 2, 340);

    ctx.setFontSize(24);
    ctx.setFillStyle('rgba(255,255,255,0.6)');
    ctx.fillText('邀请你一起参加机器狗迷宫竞速', W / 2, 375);

    // ⑤ 助力进度区
    const progressBoxY = 420;
    ctx.setFillStyle('rgba(255,255,255,0.08)');
    ctx.fillRect(60, progressBoxY, W - 120, 160);
    ctx.setStrokeStyle('rgba(255,255,255,0.15)');
    ctx.setLineWidth(1);
    ctx.strokeRect(60, progressBoxY, W - 120, 160);

    ctx.setFillStyle('#e94560');
    ctx.setFontSize(28);
    ctx.fillText('助力进度', W / 2, progressBoxY + 40);

    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(56);
    ctx.fillText(`${activity.currentHelpCount} / ${activity.requiredHelpCount}`, W / 2, progressBoxY + 105);

    ctx.setFontSize(22);
    ctx.setFillStyle('rgba(255,255,255,0.5)');
    ctx.fillText(`还差 ${activity.requiredHelpCount - activity.currentHelpCount} 人助力即可获得免费次数`, W / 2, progressBoxY + 140);

    // ⑥ 底部引导文字
    ctx.setFillStyle('#e94560');
    ctx.setFontSize(28);
    ctx.fillText('长按识别小程序码', W / 2, 640);
    ctx.fillText('为我助力', W / 2, 680);

    // ⑦ 底部小程序码区域（占位）
    ctx.setFillStyle('rgba(255,255,255,0.1)');
    ctx.fillRect(W / 2 - 75, 710, 150, 150);
    ctx.setFillStyle('rgba(255,255,255,0.3)');
    ctx.setFontSize(22);
    ctx.fillText('小程序码', W / 2, 795);

    ctx.draw(false, () => {
      this.setData({ shareCardReady: true });
    });
  },

  /**
   * 绘制头像图片（异步加载）
   */
  drawAvatarImage(
    ctx: WechatMiniprogram.CanvasContext,
    url: string,
    x: number,
    y: number,
    w: number,
    h: number,
    callback: () => void,
  ) {
    if (!url) {
      // 默认头像占位
      ctx.setFillStyle('#e94560');
      ctx.fillRect(x, y, w, h);
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(36);
      ctx.setTextAlign('center');
      ctx.fillText('👤', x + w / 2, y + h / 2 + 12);
      callback();
      return;
    }

    // 微信小程序中需要先下载图片
    wx.getImageInfo({
      src: url,
      success: (res) => {
        ctx.drawImage(res.path, x, y, w, h);
        callback();
      },
      fail: () => {
        ctx.setFillStyle('#e94560');
        ctx.fillRect(x, y, w, h);
        callback();
      },
    });
  },

  /**
   * 保存分享卡片到相册
   */
  onSaveShareCard() {
    wx.canvasToTempFilePath({
      canvasId: 'shareCanvas',
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: (err) => {
            if ((err as any).errMsg?.includes('auth deny')) {
              wx.showModal({
                title: '需要相册权限',
                content: '请前往设置开启相册权限',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting();
                  }
                },
              });
            }
          },
        });
      },
      fail: () => {
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      },
    }, this);
  },

  /**
   * 查看助力记录详情
   */
  onViewHelper(e: WechatMiniprogram.TouchEvent) {
    const { helperid, helpername } = e.currentTarget.dataset;
    // 可跳转到用户主页或弹窗展示
    wx.showToast({ title: helpername || '好友', icon: 'none' });
  },

  /**
   * 分享给好友 — 微信转发
   */
  onShareAppMessage() {
    return {
      title: `${getApp<IAppOption>().globalData.userInfo?.nickname || '好友'}邀请你助力机器狗迷宫竞速！`,
      path: `/pages/help/help?id=${this.data.helpId}`,
      imageUrl: '', // 可置为 canvas 生成的临时图片
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '帮我助力！一起玩机器狗迷宫竞速',
      query: `id=${this.data.helpId}`,
      imageUrl: '',
    };
  },
});
