import { Outlet } from 'react-router-dom';

export default function ScreenLayout() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e', color: 'white', overflow: 'hidden' }}>
      <Outlet />
    </div>
  );
}
