/**
 * 微信自定义菜单服务
 *
 * 启动时自动调用 POST /cgi-bin/menu/create 创建菜单。
 * 服务号后台可视化编辑已禁用，必须走 API。
 *
 * API: POST https://api.weixin.qq.com/cgi-bin/menu/create?access_token=TOKEN
 * 文档: https://developers.weixin.qq.com/doc/offiaccount/Custom_Menus/Creating_Custom-Defined_Menu.html
 */
import { getAccessToken } from './wechat-token';

const MENU = {
  button: [
    {
      name: '裁判入口',
      type: 'view',
      url: 'https://dog.amberrobot.com.cn/referee/login',
    },
    {
      name: '现场大屏',
      type: 'click',
      key: 'screen_display',
    },
  ],
};

/**
 * 创建/更新服务号自定义菜单
 */
export async function createMenu(): Promise<void> {
  try {
    const accessToken = await getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${accessToken}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MENU),
    });

    const data: any = await resp.json();

    if (data.errcode && data.errcode !== 0) {
      console.error(
        `[WechatMenu] 菜单创建失败: ${data.errmsg} (errcode=${data.errcode})`
      );
      return;
    }

    console.log('[WechatMenu] 菜单创建成功');
  } catch (e: any) {
    console.error('[WechatMenu] 菜单创建异常:', e.message);
  }
}
