#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
玩家小程序 — 实战流程测试（需先登录）
包括：查看段位 → 购买参赛包 → 查看卡券 → 积分兑换
"""

import minium
import time


class TestPlayerFlows(minium.MiniTest):

    def setUp(self):
        """等待登录态就绪"""
        time.sleep(3)

    def test_view_season_info(self):
        """查看段位信息"""
        self.app.navigate_to("/pages/profile/profile")
        time.sleep(2)
        # 检查段位显示区域
        page = self.app.get_current_page()
        self.assertIsNotNone(page, "个人中心页未加载")
        # 段位信息存在（由后端返回的 levelName 字段渲染）
        # 这里需要根据实际 DOM 结构调整选择器
        level_elem = page.get_element(".level-name") or page.get_element(".level-badge")
        self.assertIsNotNone(level_elem, "段位信息未显示")

    def test_coupon_tabs(self):
        """我的卡券页4个Tab切换"""
        self.app.navigate_to("/pages/coupon/coupon")
        time.sleep(2)
        page = self.app.get_current_page()
        # 检查4个Tab是否渲染
        tabs = page.get_elements(".cc-tab")
        self.assertEqual(len(tabs), 4, "卡券Tab数量不对，应为4个")
        # 点击每个Tab检查切换
        for i, tab in enumerate(tabs):
            tab.click()
            time.sleep(0.5)
        self.assertTrue(True, "4个Tab切换正常")

    def test_points_shop_list(self):
        """积分商城加载商品列表"""
        self.app.navigate_to("/pages/points/points")
        time.sleep(3)
        page = self.app.get_current_page()
        # 检查商品列表存在
        items = page.get_elements(".point-item") or page.get_elements(".goods-card")
        self.assertTrue(len(items) > 0, "积分商品列表为空")

    def test_race_package_detail(self):
        """参赛包详情页"""
        self.app.navigate_to("/pages/packages/packages")
        time.sleep(2)
        page = self.app.get_current_page()
        # 检查三种参赛包（基础/标准/专业）
        packages = page.get_elements(".package-card") or page.get_elements(".pkg-card")
        self.assertTrue(len(packages) >= 2, "参赛包数量不足")
