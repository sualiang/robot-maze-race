// 运营商端 - 本地存储封装
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
  TOKEN: 'operator_token',
  USER: 'operator_user',
  VENUE_ID: 'operator_venue_id',
  VENUE_NAME: 'operator_venue_name',
  VENUES: 'operator_venues',
  LAST_SCAN_TIME: 'operator_last_scan_time'
};

module.exports = {
  setSync: setSync,
  getSync: getSync,
  removeSync: removeSync,
  STORAGE_KEYS: STORAGE_KEYS
};
