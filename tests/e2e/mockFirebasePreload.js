'use strict';

const admin = require('firebase-admin');

// 1. Ensure admin.apps exists so legacy code `admin.apps.length` does not crash
if (!admin.apps) {
  admin.apps = [];
}

// 2. Define admin.auth so legacy code `admin.auth().verifyIdToken()` works smoothly in test mode
admin.auth = function () {
  return {
    verifyIdToken: async function (idToken) {
      if (typeof idToken === 'string' && (idToken.startsWith('mock-token-') || idToken === 'test-bearer-token')) {
        const uid = idToken.startsWith('mock-token-') ? idToken.replace('mock-token-', '') : 'e2e-test-user-id';
        return {
          uid: uid,
          email: `${uid}@e2e-test.local`,
          auth_time: Math.floor(Date.now() / 1000),
          user_id: uid,
          sub: uid,
        };
      }
      throw new Error('Invalid or expired Firebase token in mock auth');
    },
  };
};
