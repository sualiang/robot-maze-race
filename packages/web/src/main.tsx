import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 全局错误上报 — sendBeacon + fetch 双通道
const reportError = (level: string, message: string, source?: string, detail?: string) => {
  if (!message) return
  // 防止循环上报：reportError 自身发出去的请求不要再上报
  if (source === 'reportError') return
  const body = JSON.stringify({ level: level || 'error', message: message || '', source: source || '', detail: detail || '', url: location.href })
  try { navigator.sendBeacon('/api/v1/client-log', body) } catch {}
  // 用原生 XMLHttpRequest 代替 fetch，避免被 fetch 劫持触发循环
  try { var x = new XMLHttpRequest(); x.open('POST', '/api/v1/client-log', true); x.setRequestHeader('Content-Type','application/json'); x.send(body); } catch {}
}

// 1. 劫持 XMLHttpRequest — 捕获所有 API 请求失败
const origOpen = XMLHttpRequest.prototype.open
const origSend = XMLHttpRequest.prototype.send
XMLHttpRequest.prototype.open = function(method: string, url: string | URL) {
  this._xhrUrl = typeof url === 'string' ? url : url.href
  this._xhrMethod = method
  return origOpen.apply(this, arguments as any)
}
XMLHttpRequest.prototype.send = function(body?: any) {
  this.addEventListener('error', () => {
    reportError('error', `[XHR_ERROR] ${this._xhrMethod} ${this._xhrUrl}`, 'XMLHttpRequest')
  })
  this.addEventListener('load', () => {
    if (this.status >= 400) {
      reportError('error', `[XHR_${this.status}] ${this._xhrMethod} ${this._xhrUrl}`, 'XMLHttpRequest')
    }
  })
  return origSend.apply(this, arguments as any)
}

// 2. 劫持 fetch — 捕获所有 fetch 请求失败
const origFetch = window.fetch
window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url)
  return origFetch.apply(this, arguments as any).then((response: Response) => {
    if (!response.ok) {
      reportError('error', `[FETCH_${response.status}] ${init?.method || 'GET'} ${url}`, 'fetch')
    }
    return response
  }).catch((err: Error) => {
    reportError('error', `[FETCH_ERROR] ${url} - ${err.message}`, 'fetch')
    throw err
  })
}

// 3. 拦截 window.onerror（未捕获的 JS 运行时错误）
window.onerror = (msg, url, line, col, err) => {
  reportError('error', String(msg), url, `${line}:${col} ${err?.stack || ''}`)
}

// 4. 拦截未处理的 Promise rejection
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason
  const msg = reason?.message || reason?.toString() || 'Unknown Promise rejection'
  reportError('error', msg, '', reason?.stack || '')
})

// 5. 劫持 console.error 捕获所有手动打印的错误
const origConsoleError = console.error
console.error = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'object' ? (a?.stack || a?.message || JSON.stringify(a)) : String(a))).join(' ')
  reportError('error', msg, 'console.error')
  origConsoleError.apply(console, args)
}

// 6. 劫持 console.warn 也报
const origConsoleWarn = console.warn
console.warn = (...args: any[]) => {
  reportError('warn', args.map(a => String(a)).join(' '))
  origConsoleWarn.apply(console, args)
}

// 页面加载后发送一条存活检测
setTimeout(() => {
  reportError('info', '[LIVENESS] 页面加载完成', 'main.tsx', 'liveness check')
}, 3000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
