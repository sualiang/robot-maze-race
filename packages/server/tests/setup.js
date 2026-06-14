/**
 * Global Jest setup - runs before any test file.
 * Sets NODE_ENV=development so config.isDev returns true.
 */
module.exports = async () => {
  process.env.NODE_ENV = 'development';
  console.log('[globalSetup] NODE_ENV set to', process.env.NODE_ENV);
};
