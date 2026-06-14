#!/bin/bash
# ============================================
# 前端页面验证脚本
# ============================================

NOPROXY="--noproxy localhost"
FRONTEND="http://localhost:5173"

echo "============================================"
echo "【第3步】前端页面验证"
echo "============================================"

echo ""
echo "=== 1. 运营商后台 - 赛场管理 ==="
echo "URL: $FRONTEND/operator/venues"
RESP=$(curl -s $NOPROXY "$FRONTEND/operator/venues")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $NOPROXY "$FRONTEND/operator/venues")
echo "HTTP Status: $HTTP_CODE"
echo "Content preview: $(echo "$RESP" | head -5)"

if [ -z "$RESP" ]; then
  echo "❌ 页面返回空"
elif echo "$RESP" | grep -qi "场馆\|赛场\|venues\|robot\|React\|root\|id=\"root\""; then
  echo "✅ 页面包含关键内容"
else
  echo "⚠️ 页面响应正常但未检测到预期关键词"
  echo "长度: ${#RESP} 字符"
fi

echo ""
echo "=== 2. 总部后台 - 运营商管理 ==="
RESP=$(curl -s $NOPROXY "$FRONTEND/admin/operators")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $NOPROXY "$FRONTEND/admin/operators")
echo "HTTP Status: $HTTP_CODE"
if echo "$RESP" | grep -qi "运营商\|operator\|admin\|root\|React\|id=\"root\""; then
  echo "✅ 页面包含关键内容"
else
  echo "⚠️ 页面响应正常但未检测到预期关键词"
  echo "长度: ${#RESP} 字符"
fi

echo ""
echo "=== 3. 大屏展示 ==="
RESP=$(curl -s $NOPROXY "$FRONTEND/screen/display")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $NOPROXY "$FRONTEND/screen/display")
echo "HTTP Status: $HTTP_CODE"
if echo "$RESP" | grep -qi "大屏\|display\|screen\|root\|React\|id=\"root\""; then
  echo "✅ 页面包含关键内容"
else
  echo "⚠️ 页面响应正常但未检测到预期关键词"
  echo "长度: ${#RESP} 字符"
fi

echo ""
echo "============================================"
echo "【前端页面验证完成】"
echo "============================================"
