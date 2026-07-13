import { useState, useEffect } from 'react';
import { getCurrentContext, type OperatorContext } from '../utils/api';

interface UseOperatorContextResult {
  context: OperatorContext | null;
  hasContext: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * 获取当前玩家的运营商上下文
 * 用于 H5 页面判断是否在运营商上下文中（从 Redis/JWT 读取）
 */
export function useOperatorContext(): UseOperatorContextResult {
  const [context, setContext] = useState<OperatorContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      // 未登录 → 确定无上下文
      setLoading(false);
      return;
    }

    getCurrentContext()
      .then((ctx) => {
        setContext(ctx);
      })
      .catch((e) => {
        console.warn('[useOperatorContext] 获取上下文失败:', e);
        setError('获取运营商上下文失败');
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    context,
    hasContext: context !== null && !!context?.operatorId,
    loading,
    error,
  };
}
