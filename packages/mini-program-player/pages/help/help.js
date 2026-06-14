// pages/help/help.js - 好友助力裂变页
var request = require('../../utils/request');

Page({
  data: {
    activity: null,
    helpId: '',
    loading: true,
    isInitiator: false,
    isHelper: false,
    canHelp: true,
    canvasWidth: 600,
    canvasHeight: 800,
    shareCardReady: false
  },

  onLoad: function (options) {
    if (options && options.id) {
      this.setData({ helpId: options.id });
      this.loadHelpDetail(options.id);
    } else {
      this.createHelpActivity();
    }
  },

  loadHelpDetail: function (id) {
    var that = this;
    that.setData({ loading: true });
    request.get('/player/help/detail', { helpId: id }).then(function (data) {
      var activity = data.activity;
      if (activity && activity.helpers && activity.helpers.length > 0) {
        activity.firstHelperName = activity.helpers[0].helperNickname || '用户';
      } else {
        activity.firstHelperName = '发起者';
      }
      if (activity) {
        activity.progressPercent = Math.round(activity.currentHelpCount / activity.requiredHelpCount * 100);
      }
      that.setData({
        activity: activity,
        isInitiator: data.isInitiator,
        isHelper: data.isHelper,
        canHelp: data.canHelp,
        loading: false
      });
      if (data.isInitiator) {
        setTimeout(function () { that.generateShareCard(); }, 500);
      }
    }).catch(function (err) {
      console.error('获取助力详情失败', err);
      that.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '获取数据失败', icon: 'none' });
    });
  },

  createHelpActivity: function () {
    var that = this;
    that.setData({ loading: true });
    request.post('/player/help/create', { targetPackageId: '' }).then(function (activity) {
      that.setData({
        activity: activity,
        helpId: activity.id,
        isInitiator: true,
        loading: false
      });
      setTimeout(function () { that.generateShareCard(); }, 500);
    }).catch(function (err) {
      console.error('创建助力失败', err);
      that.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
    });
  },

  onDoHelp: function () {
    var that = this;
    var app = getApp();

    // 获取设备ID用于防刷校验
    var deviceId = '';
    try {
      var sysInfo = wx.getSystemInfoSync();
      deviceId = sysInfo.deviceId || '';
    } catch (e) {
      deviceId = '';
    }

    if (!app.globalData.isLoggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '登录后可以为好友助力',
        confirmText: '去登录',
        success: function (res) {
          if (res.confirm) {
            app.wxLogin().then(function () { that.onDoHelp(); });
          }
        }
      });
      return;
    }
    wx.showLoading({ title: '助力中...' });
    request.post('/player/help/action', {
      helpId: that.data.helpId,
      helperDeviceId: deviceId
    }).then(function () {
      wx.hideLoading();
      wx.showToast({ title: '助力成功！', icon: 'success' });
      that.loadHelpDetail(that.data.helpId);
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: (err && err.message) || '助力失败', icon: 'none' });
    });
  },

  generateShareCard: function () {
    var that = this;
    var activity = that.data.activity;
    var helpId = that.data.helpId;
    if (!activity || !helpId) return;

    var app = getApp();
    var user = app.globalData.userInfo;
    if (!user) return;

    var ctx = wx.createCanvasContext('shareCanvas', that);
    var W = that.data.canvasWidth;
    var H = that.data.canvasHeight;

    var gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.setFillStyle(gradient);
    ctx.fillRect(0, 0, W, H);

    ctx.setFillStyle('rgba(233,69,96,0.15)');
    ctx.beginPath();
    ctx.arc(W / 2, 80, 160, 0, 2 * Math.PI);
    ctx.fill();

    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(40);
    ctx.setTextAlign('center');
    ctx.fillText('机器狗迷宫竞速', W / 2, 140);
    ctx.setFontSize(28);
    ctx.setFillStyle('rgba(255,255,255,0.7)');
    ctx.fillText('好友助力 · 免费获取参赛次数', W / 2, 185);

    var avatarY = 250;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, avatarY, 50, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    that.drawAvatarImage(ctx, user.avatarUrl, W / 2 - 50, avatarY - 50, 100, 100, function () {
      ctx.restore();
      ctx.draw();
    });

    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(32);
    ctx.setTextAlign('center');
    ctx.fillText(user.nickname, W / 2, 340);
    ctx.setFontSize(24);
    ctx.setFillStyle('rgba(255,255,255,0.6)');
    ctx.fillText('邀请你一起参加机器狗迷宫竞速', W / 2, 375);

    var progressBoxY = 420;
    ctx.setFillStyle('rgba(255,255,255,0.08)');
    ctx.fillRect(60, progressBoxY, W - 120, 160);
    ctx.setStrokeStyle('rgba(255,255,255,0.15)');
    ctx.setLineWidth(1);
    ctx.strokeRect(60, progressBoxY, W - 120, 160);

    ctx.setFillStyle('#e94560');
    ctx.setFontSize(28);
    ctx.fillText('助力进度', W / 2, progressBoxY + 40);
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(56);
    ctx.fillText(activity.currentHelpCount + ' / ' + activity.requiredHelpCount, W / 2, progressBoxY + 105);
    ctx.setFontSize(22);
    ctx.setFillStyle('rgba(255,255,255,0.5)');
    ctx.fillText('还差 ' + (activity.requiredHelpCount - activity.currentHelpCount) + ' 人助力即可获得免费次数', W / 2, progressBoxY + 140);

    ctx.setFillStyle('#e94560');
    ctx.setFontSize(28);
    ctx.fillText('长按识别小程序码', W / 2, 640);
    ctx.fillText('为我助力', W / 2, 680);

    ctx.setFillStyle('rgba(255,255,255,0.1)');
    ctx.fillRect(W / 2 - 75, 710, 150, 150);
    ctx.setFillStyle('rgba(255,255,255,0.3)');
    ctx.setFontSize(22);
    ctx.fillText('小程序码', W / 2, 795);

    ctx.draw(false, function () {
      that.setData({ shareCardReady: true });
    });
  },

  drawAvatarImage: function (ctx, url, x, y, w, h, callback) {
    if (!url) {
      ctx.setFillStyle('#e94560');
      ctx.fillRect(x, y, w, h);
      ctx.setFillStyle('#ffffff');
      ctx.setFontSize(36);
      ctx.setTextAlign('center');
      ctx.fillText('👤', x + w / 2, y + h / 2 + 12);
      callback();
      return;
    }
    wx.getImageInfo({
      src: url,
      success: function (res) {
        ctx.drawImage(res.path, x, y, w, h);
        callback();
      },
      fail: function () {
        ctx.setFillStyle('#e94560');
        ctx.fillRect(x, y, w, h);
        callback();
      }
    });
  },

  onSaveShareCard: function () {
    var that = this;
    wx.canvasToTempFilePath({
      canvasId: 'shareCanvas',
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: function (err) {
            if (err && err.errMsg && err.errMsg.indexOf('auth deny') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '请前往设置开启相册权限',
                confirmText: '去设置',
                success: function (modalRes) {
                  if (modalRes.confirm) wx.openSetting();
                }
              });
            }
          }
        });
      },
      fail: function () {
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      }
    }, that);
  },

  onViewHelper: function (e) {
    var helpername = e.currentTarget.dataset.helpername;
    wx.showToast({ title: helpername || '好友', icon: 'none' });
  },

  onShareAppMessage: function () {
    var app = getApp();
    var name = '好友';
    if (app.globalData.userInfo && app.globalData.userInfo.nickname) {
      name = app.globalData.userInfo.nickname;
    }
    return {
      title: name + '邀请你助力机器狗迷宫竞速！',
      path: '/pages/help/help?id=' + this.data.helpId,
      imageUrl: ''
    };
  },

  onShareTimeline: function () {
    return {
      title: '帮我助力！一起玩机器狗迷宫竞速',
      query: 'id=' + this.data.helpId,
      imageUrl: ''
    };
  }
});
