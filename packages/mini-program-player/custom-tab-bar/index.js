Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        icon: '🏠'
      },
      {
        pagePath: '/pages/race/race',
        text: '比赛',
        icon: '🏁'
      },
      {
        pagePath: '/pages/leaderboard/leaderboard',
        text: '排行',
        icon: '🏆'
      },
      {
        pagePath: '/pages/profile/profile',
        text: '我的',
        icon: '👤'
      }
    ]
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      wx.switchTab({ url: path });
    }
  }
});
