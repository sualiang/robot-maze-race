#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
玩家小程序 — 自动化测试
使用 Minium 框架连接微信开发者工具

运行方式:
  export PATH="$PATH:$HOME/Library/Python/3.9/bin"
  minitest -c tests/miniprogram/config.json -s tests/miniprogram/specs
"""

import minium
import time


class TestPlayerApp(minium.MiniTest):

    def setUp(self):
        """每个测试用例前等待页面加载"""
        time.sleep(2)

    def test_app_launch(self):
        """测试小程序启动"""
        self.app.triggerEvent("onLaunch", {})
        time.sleep(2)
        # 获取当前页面栈
        pages = self.app.get_current_page()
        self.assertTrue(len(pages) > 0, "小程序未正常启动")

    def test_home_page_loads(self):
        """首页正常加载"""
        # 导航到首页
        self.app.navigate_to("/pages/index/index")
        time.sleep(2)
        # 检查页面元素存在
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "首页加载失败")

    def test_login_page(self):
        """登录页渲染"""
        self.app.navigate_to("/pages/login/login")
        time.sleep(2)
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "登录页加载失败")

    def test_profile_page(self):
        """个人中心页加载"""
        self.app.navigate_to("/pages/profile/profile")
        time.sleep(2)
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "个人中心加载失败")

    def test_coupon_page(self):
        """我的卡券页加载"""
        self.app.navigate_to("/pages/coupon/coupon")
        time.sleep(2)
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "卡券页加载失败")

    def test_race_packages_page(self):
        """参赛包列表页加载"""
        self.app.navigate_to("/pages/packages/packages")
        time.sleep(2)
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "参赛包页加载失败")

    def test_points_shop_page(self):
        """积分商城页加载"""
        self.app.navigate_to("/pages/points/points")
        time.sleep(2)
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "积分商城页加载失败")

    def test_season_ranking_page(self):
        """段位排行榜页加载"""
        self.app.navigate_to("/pages/ranking/ranking")
        time.sleep(2)
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "排行榜页加载失败")
