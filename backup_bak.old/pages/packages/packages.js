// pages/packages/packages.js - 参赛包购买页
var request = require('../../utils/request');

Page({
  data: {
    packageList: [],
    loading: true,
    empty: false
  },

  onLoad: function () {
    this.fetchPackageList();
  },

  onShow: function () {},

  onPullDownRefresh: function () {
    var that = this;
    that.fetchPackageList().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  fetchPackageList: function () {
    var that = this;
    that.setData({ loading: true });
    return request.get('/player/packages').then(function (list) {
      var items = list || [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        item.savedText = ((item.originalPrice - item.salePrice) / 100).toFixed(0);
        item.salePriceText = (item.salePrice / 100).toFixed(0);
        item.originalPriceText = (item.originalPrice / 100).toFixed(0);
      }
      that.setData({
        packageList: items,
        loading: false,
        empty: items.length === 0
      });
    }).catch(function (err) {
      console.error('获取参赛包列表失败', err);
      that.setData({ loading: false, empty: true });
    });
  },

  onBuyPackage: function (e) {
    var dataset = e.currentTarget.dataset;
    var id = dataset.id;
    var name = dataset.name;
    var saleprice = dataset.saleprice;
    if (!id) return;

    var priceYuan = (Number(saleprice) / 100).toFixed(2);
    var that = this;
    wx.showModal({
      title: '确认购买',
      content: '确认购买「' + name + '」？\n售价 ¥' + priceYuan,
      confirmText: '确认支付',
      cancelText: '再想想',
      success: function (res) {
        if (res.confirm) that.createOrderAndPay(id);
      }
    });
  },

  createOrderAndPay: function (packageId) {
    var that = this;
    wx.showLoading({ title: '下单中...', mask: true });

    return request.post('/player/orders', { packageId: packageId }).then(function (order) {
      wx.hideLoading();
      var pp = order.paymentParams;
      if (!pp) {
        wx.showToast({ title: '支付参数异常', icon: 'none' });
        return;
      }
      wx.requestPayment({
        timeStamp: String(pp.timeStamp),
        nonceStr: String(pp.nonceStr),
        package: String(pp.package),
        signType: pp.signType || 'MD5',
        paySign: String(pp.paySign),
        success: function () {
          wx.showToast({ title: '购买成功！', icon: 'success', duration: 2000 });
          setTimeout(function () { that.fetchPackageList(); }, 1500);
        },
        fail: function (payErr) {
          if (payErr && payErr.errMsg && payErr.errMsg.indexOf('cancel') >= 0) {
            wx.showToast({ title: '已取消支付', icon: 'none' });
          } else {
            console.error('支付失败', payErr);
            wx.showToast({ title: '支付失败，请重试', icon: 'none' });
          }
        }
      });
    }).catch(function (err) {
      wx.hideLoading();
      var msg = (err && err.message) || '下单失败，请重试';
      console.error('下单支付失败', err);
      if (msg.indexOf('取消') < 0) {
        wx.showToast({ title: msg, icon: 'none' });
      }
    });
  },

  formatPrice: function (cents) {
    return (cents / 100).toFixed(2);
  },

  getDiscountPercent: function (original, sale) {
    if (original <= sale) return '';
    return Math.round((1 - sale / original) * 100) + '折';
  },

  onShareAppMessage: function () {
    return {
      title: '热门参赛包限时抢购！快来参加机器狗迷宫竞速',
      path: '/pages/packages/packages',
      imageUrl: '/assets/images/share-package.png'
    };
  }
});
