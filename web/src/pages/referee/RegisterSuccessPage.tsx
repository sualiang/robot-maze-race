export default function RegisterSuccessPage() {
  const handleClose = () => {
    // 尝试关闭微信内置浏览器页面
    if (typeof WeixinJSBridge !== 'undefined') {
      WeixinJSBridge.call('closeWindow');
    } else {
      // 回退：返回首页或显示提示
      window.history.go(-2);
    }
  };

  return (
    <div className="referee-login-page">
      <div className="referee-login-glow-1" />
      <div className="referee-login-glow-2" />

      <div className="referee-login-box">
        <div className="referee-login-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
          {/* 成功图标 */}
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #07c160, #06ad56)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 4px 24px rgba(7, 193, 96, 0.3)',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          {/* 成功标题 */}
          <h2 style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 700,
            margin: '0 0 8px',
            letterSpacing: 1,
          }}>
            提交成功
          </h2>

          {/* 说明文字 */}
          <p style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 14,
            lineHeight: 1.8,
            margin: '0 0 32px',
            maxWidth: 280,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            您的信息已提交，运营商审核通过后将通过微信服务号通知您
          </p>

          {/* 关闭按钮 */}
          <button
            className="referee-login-btn"
            onClick={handleClose}
            style={{
              background: 'linear-gradient(135deg, #07c160, #06ad56)',
              boxShadow: '0 4px 20px rgba(7, 193, 96, 0.3)',
              letterSpacing: 2,
            }}
          >
            关闭页面
          </button>

          <div style={{ marginTop: 16 }}>
            <button
              className="referee-login-btn"
              onClick={() => window.history.go(-2)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)',
                boxShadow: 'none',
                letterSpacing: 1,
                fontSize: 14,
              }}
            >
              返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// WeixinJSBridge 类型声明
declare global {
  interface Window {
    WeixinJSBridge?: {
      call: (method: string, params?: any) => void;
    };
  }
}
