import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  // 顺序执行，避免测试文件间 SQLite 数据库冲突
  maxWorkers: 1,
  // Global setup file runs before all tests
  globalSetup: '<rootDir>/tests/setup.js',
};

export default config;
