import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppRouter from './router';

// antd v6 locale 可能是 CJS 导出 { default: ... }
const antdLocale = (zhCN as any).default ?? zhCN;

export default function App() {
  return (
    <ConfigProvider locale={antdLocale} theme={{ token: { colorPrimary: '#ff6b35' } }}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ConfigProvider>
  );
}
