# 常用代码片段

> **可复用的代码片段集合**
>
> 避免重复写同样的代码

---

## 📋 分类目录

### OpenAI SDK 模型调用
```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="<your-base-url>"
)

response = client.chat.completions.create(
    model="<model-name>",
    messages=[{"role": "user", "content": "Hello"}]
)
print(response.choices[0].message.content)
```

### Node.js 密码生成（安全密码规则）
```javascript
function generateSecurePassword(length = 12) {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;
  
  // 确保每类字符至少一个
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  
  // 补足长度
  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  
  // 打乱顺序
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}
```

### Node.js UUID 生成
```javascript
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
```

### 前端
- [待补充]

### SQL
- [待补充]

### Shell 脚本
```bash
# 带时间戳的日志追加
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> /var/log/deploy.log
}

# 安全删除确认
safe_rm() {
  read -p "确定要删除 $1 吗？(y/N): " confirm
  if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    rm -rf "$1"
    log "已删除 $1"
  else
    echo "已取消"
  fi
}
```

---

## 📝 贡献格式

每个代码片段必须包含：

1. **标题** — 片段名称
2. **适用场景** — 什么时候用
3. **代码** — 完整可运行的代码
4. **说明** — 使用方法、注意事项
5. **语言/框架** — 什么语言、什么框架

---

## ⚠️ 注意事项

1. 代码必须经过验证，确保能正常运行
2. 敏感信息（密钥、密码、内部地址）必须脱敏
3. 有依赖的要说明依赖
4. 过时的代码要及时标记或删除

---

**最后更新：** 2026-06-26
**维护人：** 技术开发总监（小D）
