// 裁判端 - 本地存储封装
function set(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.error('[Storage] 写入失败:', key, e);
  }
}

function get(key) {
  try {
    return wx.getStorageSync(key);
  } catch (e) {
    return null;
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    console.error('[Storage] 删除失败:', key, e);
  }
}

function clear() {
  try {
    wx.clearStorageSync();
  } catch (e) {
    console.error('[Storage] 清除失败:', e);
  }
}

var STORAGE_KEYS = {
  TOKEN: 'referee_token',
  USER_INFO: 'referee_user_info',
  VENUE: 'referee_venue',
  ATTENDANCE: 'referee_attendance',
  OFFLINE_RESULTS: 'referee_offline_results',
  LAST_SYNC: 'referee_last_sync',
  SETTINGS: 'referee_settings'
};

// --- 裁判专用快捷方法 ---

function saveLogin(token, userInfo) {
  set(STORAGE_KEYS.TOKEN, token);
  set(STORAGE_KEYS.USER_INFO, userInfo);
}

function getToken() {
  return get(STORAGE_KEYS.TOKEN);
}

function getUserInfo() {
  return get(STORAGE_KEYS.USER_INFO);
}

function saveVenue(venue) {
  set(STORAGE_KEYS.VENUE, venue);
}

function getVenue() {
  return get(STORAGE_KEYS.VENUE);
}

function clearLogin() {
  remove(STORAGE_KEYS.TOKEN);
  remove(STORAGE_KEYS.USER_INFO);
  remove(STORAGE_KEYS.VENUE);
  remove(STORAGE_KEYS.ATTENDANCE);
}

function isLoggedIn() {
  return !!getToken() && !!getUserInfo();
}

// 兼容旧 API
module.exports = {
  STORAGE_KEYS: STORAGE_KEYS,
  set: set,
  get: get,
  remove: remove,
  clear: clear,
  setSync: set,
  getSync: get,
  removeSync: remove,
  clearSync: clear,
  saveLogin: saveLogin,
  getToken: getToken,
  getUserInfo: getUserInfo,
  saveVenue: saveVenue,
  getVenue: getVenue,
  clearLogin: clearLogin,
  isLoggedIn: isLoggedIn
};
