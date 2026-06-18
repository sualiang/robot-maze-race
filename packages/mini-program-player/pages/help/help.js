// pages/help/help.js - 发起者的助力管理页
var request = require('../../utils/request');

Page({
  data: {
    activity: null,
    loading: true,
    emptySlots: [],
    canvasWidth: 300,
    canvasHeight: 450,
    canvasReady: false
  },

  onLoad: function () {
    var that = this;
    that.setData({ loading: true });
    request.get('/player/me/help-status').then(function (data) {
      if (data && data.activity) {
        var activity = data.activity;
        activity.progressPercent = that.calcProgress(activity.currentHelpCount, activity.requiredHelpCount);
        var helpers = activity.helpers || [];
        var emptyCount = activity.requiredHelpCount - helpers.length;
        if (emptyCount < 0) emptyCount = 0;
        var emptySlots = [];
        for (var i = 0; i < emptyCount; i++) {
          emptySlots.push({ index: i });
        }
        that.setData({
          activity: activity,
          emptySlots: emptySlots,
          loading: false
        });
        // 延迟生成海报 canvas
        setTimeout(function () {
          that.generatePoster();
        }, 800);
      } else {
        that.setData({ loading: false });
      }
    }).catch(function (err) {
      console.error('获取助力状态失败', err);
      that.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '获取数据失败', icon: 'none' });
    });
  },

  calcProgress: function (current, required) {
    if (!required || required <= 0) return 0;
    var pct = Math.round(current / required * 100);
    if (pct > 100) pct = 100;
    return pct;
  },

  createHelpActivity: function () {
    var that = this;
    that.setData({ loading: true });
    request.post('/player/help/create', {}).then(function (activity) {
      if (activity) {
        activity.progressPercent = that.calcProgress(activity.currentHelpCount, activity.requiredHelpCount);
        var helpers = activity.helpers || [];
        var emptyCount = activity.requiredHelpCount - helpers.length;
        if (emptyCount < 0) emptyCount = 0;
        var emptySlots = [];
        for (var i = 0; i < emptyCount; i++) {
          emptySlots.push({ index: i });
        }
        that.setData({
          activity: activity,
          emptySlots: emptySlots,
          loading: false
        });
        setTimeout(function () {
          that.generatePoster();
        }, 800);
      } else {
        that.setData({ loading: false });
      }
    }).catch(function (err) {
      console.error('创建助力失败', err);
      that.setData({ loading: false });
      wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
    });
  },

  // 生成分享海报
  generatePoster: function () {
    var that = this;
    var activity = that.data.activity;
    if (!activity) return;

    var app = getApp();
    var user = app.globalData.userInfo;
    if (!user || !user.avatarUrl) return;

    var ctx = wx.createCanvasContext('shareCanvas', that);
    var W = that.data.canvasWidth;
    var H = that.data.canvasHeight;

    // 背景渐变
    var gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.setFillStyle(gradient);
    ctx.fillRect(0, 0, W, H);

    // 装饰发光圆
    ctx.setFillStyle('rgba(233,69,96,0.12)');
    ctx.beginPath();
    ctx.arc(W / 2, 50, 100, 0, 2 * Math.PI);
    ctx.fill();

    // 标题
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(22);
    ctx.setTextAlign('center');
    ctx.fillText('机器狗迷宫竞速', W / 2, 60);
    ctx.setFontSize(14);
    ctx.setFillStyle('rgba(255,255,255,0.6)');
    ctx.fillText('好友助力·免费参赛', W / 2, 85);

    // 用户头像（圆形裁剪）
    var avatarX = W / 2 - 28;
    var avatarY = 115;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, avatarY + 28, 28, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();
    that._drawAvatarImage(ctx, user.avatarUrl, avatarX, avatarY, 56, 56, function () {
      ctx.restore();
      ctx.draw();
    });

    // 用户昵称
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(18);
    ctx.setTextAlign('center');
    ctx.fillText(user.nickname || '我', W / 2, 185);

    // 进度框
    var boxY = 210;
    ctx.setFillStyle('rgba(255,255,255,0.06)');
    ctx.fillRect(30, boxY, W - 60, 90);
    ctx.setStrokeStyle('rgba(255,255,255,0.1)');
    ctx.setLineWidth(1);
    ctx.strokeRect(30, boxY, W - 60, 90);

    ctx.setFillStyle('#e94560');
    ctx.setFontSize(16);
    ctx.fillText('助力进度', W / 2, boxY + 28);
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(32);
    ctx.fillText(activity.currentHelpCount + ' / ' + activity.requiredHelpCount, W / 2, boxY + 68);
    ctx.setFontSize(12);
    ctx.setFillStyle('rgba(255,255,255,0.4)');
    ctx.fillText('还差 ' + (activity.requiredHelpCount - activity.currentHelpCount) + ' 人', W / 2, boxY + 85);

    // 底部提示
    ctx.setFillStyle('#e94560');
    ctx.setFontSize(16);
    ctx.fillText('长按小程序码为我助力', W / 2, 340);
    ctx.setFillStyle('#e94560');
    ctx.setFontSize(16);
    ctx.fillText('扫码加入', W / 2, 365);

    // 小程序码占位
    ctx.setFillStyle('rgba(255,255,255,0.06)');
    ctx.fillRect(W / 2 - 40, 390, 80, 80);
    ctx.setFillStyle('rgba(255,255,255,0.2)');
    ctx.setFontSize(12);
    ctx.fillText('小程序码', W / 2, 435);

    ctx.draw(false, function () {
      that.setData({ canvasReady: true });
    });
  },

  _drawAvatarImage: function (ctx, url, x, y, w, h, callback) {
    if (!url) {
      ctx.setFillStyle('#e94560');
      ctx.fillRect(x, y, w, h);
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
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          }
        });
      },
      fail: function (err) {
        console.error('生成海报失败', err);
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      }
    });
  },

  onViewHelper: function (e) {
    var helperName = e.currentTarget.dataset.helpername || '好友';
    wx.showToast({ title: helperName, icon: 'none' });
  },

  onShareTap: function () {
    // 用户点击分享按钮，由 open-type="share" 处理
  },

  onShareAppMessage: function () {
    var that = this;
    var activity = that.data.activity;
    var helpId = activity ? activity.helpId || activity.id : '';
    var app = getApp();
    var nickname = '好友';
    if (app.globalData.userInfo && app.globalData.userInfo.nickname) {
      nickname = app.globalData.userInfo.nickname;
    }
    return {
      title: nickname + '邀请你助力机器狗迷宫竞速！',
      path: '/pages/help/assist/assist?help_id=' + helpId + '&inviter=' + encodeURIComponent(nickname),
      imageUrl: ''
    };
  }
});
