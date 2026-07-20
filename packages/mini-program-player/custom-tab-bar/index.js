Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        iconPath: '/assets/tabbar/home.png',
        selectedIconPath: '/assets/tabbar/home-active.png'
      },
      {
        pagePath: '/pages/race/race',
        text: '比赛',
        iconPath: '/assets/tabbar/race.png',
        selectedIconPath: '/assets/tabbar/race-active.png'
      },
      {
        pagePath: '/pages/leaderboard/leaderboard',
        text: '榜单',
        iconPath: '/assets/tabbar/leaderboard.png',
        selectedIconPath: '/assets/tabbar/leaderboard-active.png'
      },
      {
        pagePath: '/pages/profile/profile',
        text: '我的',
        iconPath: '/assets/tabbar/profile.png',
        selectedIconPath: '/assets/tabbar/profile-active.png'
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
