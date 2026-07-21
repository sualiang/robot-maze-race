Component({
  properties: {
    showLogo: { type: Boolean, value: false },
    title: { type: String, value: '' }
  },

  data: {
    statusBarHeight: 20,
    navHeight: 64
  },

  attached() {
    const info = wx.getSystemInfoSync();
    const statusBarHeight = info.statusBarHeight || 20;
    // nav-inner height 88rpx + status bar
    const navHeight = statusBarHeight + 44; // 44px ≈ 88rpx on iPhone
    this.setData({ statusBarHeight, navHeight });
  }
});