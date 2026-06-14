import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import OperatorLayout from '../layouts/OperatorLayout';
import ScreenLayout from '../layouts/ScreenLayout';
import AdminLayout from '../layouts/AdminLayout';
import RefereeLayout from '../layouts/RefereeLayout';

// 懒加载页面
import VenueList from '../pages/operator/venues/VenueList';
import VenueEdit from '../pages/operator/venues/VenueEdit';
import RefereeList from '../pages/operator/referees/RefereeList';
import PackageList from '../pages/operator/packages/PackageList';
import MarketingConfig from '../pages/operator/marketing/MarketingConfig';
import FinanceCenter from '../pages/operator/finance/FinanceCenter';

import OperatorLoginPage from '../pages/operator/login/OperatorLoginPage';

// 运营商新增页面（小程序的 H5 迁移）

import AdminOperatorDashboard from '../pages/admin/dashboard/OperatorDashboard';
import OperatorRbac from '../pages/operator/rbac/OperatorRbac';
import OperatorProfile from '../pages/operator/profile/OperatorProfile';

import ScreenLogin from '../pages/screen/login/ScreenLogin';
import ScreenDisplay from '../pages/screen/display/ScreenDisplay';

import AdminLoginPage from '../pages/admin/login/AdminLoginPage';
import AdminFirstSetupPage from '../pages/admin/setup/AdminFirstSetupPage';
import OperatorManage from '../pages/admin/operators/OperatorManage';
import MarketingGlobal from '../pages/admin/marketing/MarketingGlobal';
import FinanceGlobal from '../pages/admin/finance/FinanceGlobal';

import AdminPlayers from '../pages/admin/players/AdminPlayers';
import OperatorPlayers from '../pages/operator/players/OperatorPlayers';

import SystemSettings from '../pages/admin/settings/SystemSettings';
import AdminRBAC from '../pages/admin/rbac';
import AdminProfile from '../pages/admin/profile/AdminProfile';

// 裁判端页面
const RefereeLoginPage = React.lazy(() => import('../pages/referee/LoginPage'));
const RefereeMatchPage = React.lazy(() => import('../pages/referee/MatchPage'));
const RefereeAttendancePage = React.lazy(() => import('../pages/referee/AttendancePage'));
const RefereeHistoryPage = React.lazy(() => import('../pages/referee/HistoryPage'));
const RefereeProfilePage = React.lazy(() => import('../pages/referee/ProfilePage'));

function Suspended({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<div style={{ color: '#fff', padding: 40, textAlign: 'center' }}>加载中...</div>}>{children}</React.Suspense>;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/operator/login" replace />} />

      {/* 运营商登录页（无布局） */}
      <Route path="/operator/login" element={<OperatorLoginPage />} />

      {/* 运营商后台 */}
      <Route path="/operator" element={<OperatorLayout />}>
        <Route index element={<Navigate to="venues" replace />} />
        <Route path="profile" element={<OperatorProfile />} />
        <Route path="venues" element={<VenueList />} />
        <Route path="venues/:id" element={<VenueEdit />} />
        <Route path="referees" element={<RefereeList />} />
        <Route path="packages" element={<PackageList />} />
        <Route path="marketing" element={<MarketingConfig />} />
        <Route path="rbac" element={<OperatorRbac />} />
        <Route path="players" element={<OperatorPlayers />} />
        <Route path="finance" element={<FinanceCenter />} />
      </Route>

      {/* 大屏展示端 */}
      <Route path="/screen" element={<ScreenLayout />}>
        <Route index element={<ScreenDisplay />} />
        <Route path="login" element={<ScreenLogin />} />
        <Route path="display" element={<ScreenDisplay />} />
      </Route>

      {/* 总部管理后台 */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/first-setup" element={<AdminFirstSetupPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route path="login" element={<Navigate to="/admin/login" replace />} />
        <Route path="operators" element={<OperatorManage />} />
        <Route path="marketing" element={<MarketingGlobal />} />
        <Route path="dashboard" element={<AdminOperatorDashboard />} />
        <Route path="finance" element={<FinanceGlobal />} />
        <Route path="players" element={<AdminPlayers />} />
        <Route path="rbac" element={<AdminRBAC />} />
        <Route path="settings" element={<SystemSettings />} />
        <Route path="profile" element={<AdminProfile />} />
      </Route>

      {/* 裁判端（移动端 H5） */}
      <Route path="/referee" element={<RefereeLayout />}>
        <Route index element={<Navigate to="/referee/match" replace />} />
        <Route path="login" element={<Suspended><RefereeLoginPage /></Suspended>} />
        <Route path="match" element={<Suspended><RefereeMatchPage /></Suspended>} />
        <Route path="attendance" element={<RefereeAttendancePage />} />
        <Route path="history" element={<RefereeHistoryPage />} />
        <Route path="profile" element={<Suspended><RefereeProfilePage /></Suspended>} />
      </Route>
    </Routes>
  );
}
