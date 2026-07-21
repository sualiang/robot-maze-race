import { Modal, Button, Input, Typography, Space } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface AccountInfoModalProps {
  open: boolean;
  account: string;
  password: string;
  loginUrl?: string;
  role?: string;  // operator | referee | player | admin
  onClose: () => void;
}

export default function AccountInfoModal({ open, account, password, loginUrl: customLoginUrl, role, onClose }: AccountInfoModalProps) {
  const host = window.location.origin;
  // 根据角色返回对应登录页路径
  const rolePaths: Record<string, string> = {
    operator: '/operator/login',
    referee: '/referee/login',
    player: '/player/login',
    admin: '/admin/login',
  };
  const defaultPath = rolePaths[role || ''] || '/admin/login';
  const loginUrl = customLoginUrl || `${host}${defaultPath}`;

  const roleLabel: Record<string, string> = { operator: '运营商', referee: '裁判', player: '玩家', admin: '总部管理员', merchant: '商家' };
  const roleText = role ? roleLabel[role] || '' : '';

  const textToCopy = `${roleText}端：\n登录账号：${account}\n初始密码：${password}\n登录地址：${loginUrl}\n首次登录请设置用户名和修改密码`;

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      Modal.success({
        title: '复制成功',
        content: '已复制到剪贴板，可转发给相关人员',
      });
    });
  };

  return (
    <Modal
      title="账号开通成功"
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" icon={<CopyOutlined />} onClick={handleCopy}>
            一键复制
          </Button>
        </Space>
      }
      width={500}
    >
      <div style={{ background: '#f5f5f5', padding: 20, borderRadius: 8, marginTop: 8 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <div>
            <Text strong>登录账号：</Text>
            <Text copyable>{account}</Text>
          </div>
          <div>
            <Text strong>初始密码：</Text>
            <Text copyable>{password}</Text>
          </div>
          <div>
            <Text strong>登录地址：</Text>
            <Text copyable>{loginUrl}</Text>
          </div>
        </Space>
        <div style={{ marginTop: 16, background: '#fff7e6', padding: '10px 14px', borderRadius: 6, border: '1px solid #ffd591' }}>
          <Text type="warning" strong style={{ fontSize: 12 }}>⚠️ 密码规则：</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.6 }}>
            密码长度至少 8 位，必须同时包含大写英文字母、小写英文字母和数字。<br />
            首次登录后请设置用户名并修改密码。
          </Paragraph>
        </div>
      </div>
    </Modal>
  );
}
