import ReactDOM from 'react-dom/client'
import { ConfigProvider, Button, Layout } from 'antd'
import zhCN from 'antd/locale/zh_CN'

function TestApp() {
  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh', padding: 24 }}>
        <h1>🏟️ 机器狗迷宫竞速赛事</h1>
        <p>测试页面 - 如果看到这个说明 React + Ant Design 正常工作</p>
        <Button type="primary" size="large">点击测试</Button>
      </Layout>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<TestApp />)
