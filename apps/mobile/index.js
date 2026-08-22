const { Buffer } = require('buffer');

globalThis.Buffer ??= Buffer;

require('expo-router/entry');
