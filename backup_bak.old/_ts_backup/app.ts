// app.ts
import { IAppOption } from './types/app';
import { request } from './utils/request';
import { STORAGE_KEYS, setSync, getSync, removeSync } from './utils/storage';

App<IAppOption>({
  globalData: {
    userInfo: null,
    token: null,
    isLoggedIn: false,
    systemInfo: null,
  },

  onLaunch() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;

    // 初始化登录
    this.initLogin();

    // 检查更新
    this.checkUpdate();
  },

  onShow() {
    // 小程序切前台时刷新登录状态
    this.refreshAuthState();
  },

  /**
   * 初始化登录流程
   * 1. 检查本地 token
   * 2. 无 token 则触发微信登录
   * 3. 调用后端 wx-login 接口
   * 4. 存储 token 和用户信息
   */
  async initLogin() {
    try {
      const cachedToken = getSync<string>(STORAGE_KEYS.TOKEN);
      const cachedUser = getSync<string>(STORAGE_KEYS.USER);

      if (cachedToken && cachedUser) {
        // 验证 token 有效性
        try {
          const user = await request('/player/me', { method: 'GET', showLoading: false });
          this.globalData.token = cachedToken;
          this.globalData.userInfo = user as any;
          this.globalData.isLoggedIn = true;
          setSync(STORAGE_KEYS.USER, user);
          console.log('[App] token 有效，自动登录成功');
          return;
        } catch {
          // token 过期，清除缓存后重新登录
          console.log('[App] token 已过期，重新登录');
          removeSync(STORAGE_KEYS.TOKEN);
          removeSync(STORAGE_KEYS.USER);
        }
      }

      // 首次登录或 token 过期，执行微信登录
      await this.wxLogin();
    } catch (error) {
      console.error('[App] 登录失败', error);
    }
  },

  /**
   * 微信登录：wx.login → 后端接口 → 存储 token
   */
  wxLogin(): Promise<void> {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (loginRes) => {
          if (!loginRes.code) {
            console.error('[App] wx.login 未返回 code');
            reject(new Error('登录凭证获取失败'));
            return;
          }

          try {
            const result: any = await request('/auth/wx-login', {
              method: 'POST',
              data: { code: loginRes.code },
              showLoading: true,
            });

            const { token, user } = result;
            setSync(STORAGE_KEYS.TOKEN, token);
            setSync(STORAGE_KEYS.USER, user);

            this.globalData.token = token;
            this.globalData.userInfo = user;
            this.globalData.isLoggedIn = true;

            console.log('[App] 登录成功', user.nickname);
            resolve();
          } catch (error) {
            console.error('[App] 后端登录接口调用失败', error);
            reject(error);
          }
        },
        fail: (err) => {
          console.error('[App] wx.login 失败', err);
          // 允许游客模式浏览部分页面
          reject(err);
        },
      });
    });
  },

  /**
   * 刷新登录状态（从 storage 读取）
   */
  refreshAuthState() {
    try {
      const token = getSync<string>(STORAGE_KEYS.TOKEN);
      const userInfo = getSync<any>(STORAGE_KEYS.USER);
      if (token && userInfo) {
        this.globalData.token = token;
        this.globalData.userInfo = userInfo;
        this.globalData.isLoggedIn = true;
      }
    } catch (e) {
      console.error('[App] 刷新登录状态失败', e);
    }
  },

  /**
   * 退出登录
   */
  logout() {
    removeSync(STORAGE_KEYS.TOKEN);
    removeSync(STORAGE_KEYS.USER);
    this.globalData.token = null;
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
  },

  /**
   * 检查小程序更新
   */
  checkUpdate() {
    if (!wx.getUpdateManager) return;

    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate((res) => {
      if (res.hasUpdate) {
        updateManager.onUpdateReady(() => {
          wx.showModal({
            title: '更新提示',
            content: '新版本已准备好，是否重启应用？',
            success(modalRes) {
              if (modalRes.confirm) {
                updateManager.applyUpdate();
              }
            },
          });
        });
        updateManager.onUpdateFailed(() => {
          wx.showModal({
            title: '更新提示',
            content: '新版本下载失败，请删除小程序后重新搜索打开',
            showCancel: false,
          });
        });
      }
    });
  },
});
