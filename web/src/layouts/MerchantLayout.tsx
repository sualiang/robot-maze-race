import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import '../pages/referee/styles.css';

const tabItems = [
  { key: '/merchant/coupon', icon: '📋', label: '优惠券管理' },
  { key: '/merchant/verify', icon: '✅', label: '核销' },
  { key: '/merchant/profile', icon: '👤', label: '我的' },
];

export default function MerchantLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showTabs, setShowTabs] = useState(true);

  useEffect(() => {
    setShowTabs(location.pathname !== '/merchant/login');
  }, [location.pathname]);

  return (
    <div className="referee-layout">
      <Outlet />
      {showTabs && (
        <nav className="referee-tabbar">
          {tabItems.map((tab) => {
            const isActive = location.pathname.startsWith(tab.key);
            return (
              <button
                key={tab.key}
                className={`tabbar-item ${isActive ? 'tabbar-active' : ''}`}
                onClick={() => navigate(tab.key)}
              >
                <span className="tabbar-icon">{tab.icon}</span>
                <span className="tabbar-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
