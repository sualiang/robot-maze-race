#!/bin/bash
# 读取服务器巡检报告
# 连接服务器 175.24.200.63 读取 /opt/backups/检查报告/ 下最新的报告文件

SERVER="175.24.200.63"
KEY="$HOME/.ssh/cc_dev_test"
REPORT_DIR="/opt/backups/检查报告"

ssh -i "$KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "cc-dev@$SERVER" "
  if [ -d '$REPORT_DIR' ]; then
    LATEST=\$(ls -t '$REPORT_DIR' 2>/dev/null | head -1)
    if [ -n \"\$LATEST\" ]; then
      echo '=== 最新报告文件：'\$LATEST
      echo '=== 报告内容 ==='
      cat '$REPORT_DIR'/\$LATEST
    else
      echo '❌ 报告目录为空'
      ls -la '$REPORT_DIR'
    fi
  else
    echo '❌ 报告目录不存在: $REPORT_DIR'
    ls -la /opt/backups/ 2>/dev/null || echo 'backups目录也不存在'
  fi
"
