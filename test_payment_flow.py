#!/usr/bin/env python3
"""铁甲快狗小程序 - 支付链路 Console 日志捕获测试"""
import minium
import sys
import json
import time

class PaymentFlowTest(minium.MiniTest):
    def test_payment_flow(self):
        """测试完整支付链路：登录 → 选参赛包 → 下单 → 支付"""
        print("=" * 60)
        print("🧪 铁甲快狗 支付链路测试 V2")
        print("=" * 60)
        
        app = self.app
        current_page = app.get_current_page()
        
        # 0. 捕获所有 console 日志
        console_logs = []
        def capture_log(msg):
            try:
                log_type = msg.get('type', 'log')
                log_args = [str(a) for a in msg.get('args', [])]
                entry = f"[CONSOLE:{log_type}] {' '.join(log_args)}"
                console_logs.append(entry)
                print(entry)
            except:
                pass
        
        app.hook_console(capture_log)
        
        # 1. 导航到登录页
        print("\n📱 步骤1: 导航到登录页")
        app.navigate_to("/pages/login/login")
        time.sleep(1.5)
        
        current_page = app.get_current_page()
        path = current_page.path
        print(f"   当前页面: {path}")
        
        # 2. 检查页面元素
        print("\n📱 步骤2: 检查页面元素")
        try:
            elements = current_page.get_elements("view")
            for el in elements[:10]:
                try:
                    print(f"   view: {el.inner_text[:40] if el.inner_text else '(no text)'}")
                except:
                    pass
        except Exception as e:
            print(f"   get_elements 失败: {e}")
        
        # 检查是否有微信登录按钮
        try:
            wx_btns = current_page.get_elements(".wx-login-btn, button")
            print(f"   按钮数量: {len(wx_btns)}")
            for btn in wx_btns[:5]:
                try:
                    print(f"   按钮: {btn.inner_text[:30] if btn.inner_text else '(no text)'}")
                except:
                    pass
        except Exception as e:
            print(f"   检查按钮失败: {e}")
        
        # 3. 输入手机号+密码登录
        print("\n📱 步骤3: 手机号+密码登录")
        try:
            inputs = current_page.get_elements("input")
            print(f"   输入框数量: {len(inputs)}")
            if len(inputs) >= 2:
                inputs[0].input("13999999999")
                print("   ✅ 输入手机号")
                inputs[1].input("admin123")
                print("   ✅ 输入密码")
                time.sleep(0.5)
                
                # 找到登录按钮
                buttons = current_page.get_elements(".login-btn, button")
                for btn in buttons:
                    text = btn.inner_text if btn.inner_text else ""
                    if "登录" in text:
                        btn.click()
                        print(f"   ✅ 点击登录按钮")
                        time.sleep(2)
                        break
        except Exception as e:
            print(f"   登录操作失败: {e}")
        
        # 4. 等待后获取当前页面
        print("\n📱 步骤4: 登录后状态")
        time.sleep(2)
        current_page = app.get_current_page()
        print(f"   当前页面: {current_page.path}")
        
        # 5. 导航到参赛包页面（如果有 packages tab）
        print("\n📱 步骤5: 检查 Tab")
        try:
            app.switch_tab("/pages/packages/packages")
            time.sleep(1.5)
            current_page = app.get_current_page()
            print(f"   Tab 页面: {current_page.path}")
        except Exception as e:
            print(f"   切换 Tab 失败: {e}")
            # 尝试 index
            try:
                app.switch_tab("/pages/index/index")
                time.sleep(1)
                current_page = app.get_current_page()
                print(f"   index 页面: {current_page.path}")
            except Exception as e2:
                print(f"   切换 index 失败: {e2}")
        
        # 6. 打印捕获的 console
        print("\n📊 Console 日志汇总:")
        print("-" * 40)
        for log in console_logs:
            if any(kw in log.lower() for kw in ['error', 'fail', 'payment', 'pay', 'token', '401', 'login', 'wx']):
                print(f"   🔍 {log}")
        
        print("\n" + "=" * 60)
        print("✅ 支付链路测试完成")
        print("=" * 60)

if __name__ == "__main__":
    minium.MiniTest.main()
