/**
 * 无运营商上下文时的引导提示条
 * 显示在页面顶部，引导用户线下扫码
 */
export default function NoContextBanner() {
  return (
    <div
      style={{
        margin: '12px 16px',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(233,69,96,0.1), rgba(233,69,96,0.05))',
        border: '1px solid rgba(233,69,96,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
        color: 'var(--ref-text-dim)',
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>📍</span>
      <span>
        请前往线下赛场扫描官方小程序码，解锁参赛功能
      </span>
    </div>
  );
}
