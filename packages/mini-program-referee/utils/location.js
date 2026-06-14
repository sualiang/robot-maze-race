// 裁判端 - GPS 定位工具

// 获取当前位置
function getCurrentLocation() {
  return new Promise(function(resolve, reject) {
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      success: function(res) {
        resolve({
          latitude: res.latitude,
          longitude: res.longitude,
          speed: res.speed,
          accuracy: res.accuracy
        });
      },
      fail: function(err) {
        // 低精度降级尝试
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: false,
          success: function(res) {
            resolve({
              latitude: res.latitude,
              longitude: res.longitude,
              speed: res.speed,
              accuracy: res.accuracy
            });
          },
          fail: function() {
            reject(err);
          }
        });
      }
    });
  });
}

// 逆地理编码
function reverseGeocode(latitude, longitude) {
  return new Promise(function(resolve) {
    resolve(latitude.toFixed(6) + ', ' + longitude.toFixed(6));
  });
}

// 获取当前位置（含地址信息）
function getCurrentLocationWithAddress() {
  return getCurrentLocation().then(function(location) {
    return reverseGeocode(location.latitude, location.longitude).then(function(address) {
      return {
        latitude: location.latitude,
        longitude: location.longitude,
        speed: location.speed,
        accuracy: location.accuracy,
        address: address
      };
    });
  });
}

// 请求定位权限并获取位置
function requestAndGetLocation() {
  return new Promise(function(resolve, reject) {
    wx.authorize({
      scope: 'scope.userLocation',
      success: function() {
        getCurrentLocationWithAddress().then(function(result) {
          resolve(result);
        }).catch(function(err) {
          reject(err);
        });
      },
      fail: function() {
        wx.showModal({
          title: '需要位置权限',
          content: '裁判端签到签退需要获取您的位置信息，请在设置中开启位置权限。',
          confirmText: '去设置',
          success: function(modalRes) {
            if (modalRes.confirm) {
              wx.openSetting({
                success: function(settingRes) {
                  if (settingRes.authSetting['scope.userLocation']) {
                    getCurrentLocationWithAddress().then(function(result) {
                      resolve(result);
                    }).catch(function(err) {
                      reject(err);
                    });
                  } else {
                    reject(new Error('用户未授权位置权限'));
                  }
                }
              });
            } else {
              reject(new Error('用户取消位置授权'));
            }
          }
        });
      }
    });
  });
}

// Haversine 公式计算两点距离（单位：米）
function calcDistance(lat1, lng1, lat2, lng2) {
  var R = 6371e3;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 判断是否在赛场范围内
function isWithinVenueRange(venueLat, venueLng, maxDistance) {
  maxDistance = maxDistance || 500;
  return getCurrentLocation().then(function(loc) {
    var distance = calcDistance(loc.latitude, loc.longitude, venueLat, venueLng);
    return distance <= maxDistance;
  }).catch(function() {
    return false;
  });
}

module.exports = {
  getCurrentLocation: getCurrentLocation,
  getCurrentLocationWithAddress: getCurrentLocationWithAddress,
  requestAndGetLocation: requestAndGetLocation,
  calcDistance: calcDistance,
  isWithinVenueRange: isWithinVenueRange
};
