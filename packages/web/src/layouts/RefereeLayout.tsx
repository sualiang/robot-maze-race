import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import '../pages/referee/styles.css';

const tabItems = [
  { key: '/referee/match', icon: '🏁', label: '比赛' },
  { key: '/referee/attendance', icon: '📍', label: '签到' },
  { key: '/referee/profile', icon: '👤', label: '我的' },
];

export default function RefereeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showTabs, setShowTabs] = useState(true);

  // 登录页不显示底部Tab
  useEffect(() => {
    setShowTabs(location.pathname !== '/referee/login');
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
