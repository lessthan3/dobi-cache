'use strict';

module.exports = {
  collectCoverageFrom: [
    'lib',
  ],
  coveragePathIgnorePatterns: [
    '.*/coverage/.*',
    '.*/tests/.*',
    '.*/node_modules/.*',
    '.*/\\..*',
    '.*\\.config\\.m?js$',
  ],
  moduleFileExtensions: [
    'js',
    'mjs',
    'json',
  ],
  testEnvironment: 'node',
  testMatch: [
    '**/?(*.)test.?(m)js?(x)',
  ],
  transform: {
    '\\.m?js$': 'babel-jest',
  },
};
