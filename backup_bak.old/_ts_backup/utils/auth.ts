// 玩家端 - 微信登录逻辑

export interface LoginResult {
  token: string;
  user: {
    id: string;
    nickname: string;
    avatar_url: string;
    phone?: string;
  };
}

export function wxLogin(): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginRes) {
        if (!loginRes.code) {
          reject(new Error('获取登录凭证失败'));
          return;
        }
        // 调用后端登录接口
        wx.request({
          url: 'https://api.example.com/api/v1/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code },
          success(res) {
            const { data } = res;
            if ((data as any).code === 0) {
              const result = (data as any).data as LoginResult;
              wx.setStorageSync('token', result.token);
              resolve(result);
            } else {
              reject(data);
            }
          },
          fail(err) {
            reject(err);
          },
        });
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

export function isLoggedIn(): boolean {
  return !!wx.getStorageSync('token');
}

export function logout(): void {
  wx.removeStorageSync('token');
  wx.removeStorageSync('user');
}
