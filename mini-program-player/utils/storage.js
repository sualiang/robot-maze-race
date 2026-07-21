// 玩家端 - 本地存储封装
function setSync(key, value) {
  try { wx.setStorageSync(key, value); } catch (e) {}
}

function getSync(key, defaultValue) {
  try {
    var res = wx.getStorageSync(key);
    return res !== '' && res !== undefined ? res : defaultValue;
  } catch (e) { return defaultValue; }
}

function removeSync(key) {
  try { wx.removeStorageSync(key); } catch (e) {}
}

var STORAGE_KEYS = {
  TOKEN: 'player_token',
  USER: 'player_user',
  OFFLINE_CHECKIN: 'offline_checkin'
};

module.exports = {
  setSync: setSync,
  getSync: getSync,
  removeSync: removeSync,
  STORAGE_KEYS: STORAGE_KEYS
};
