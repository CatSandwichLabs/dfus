const admin = require('../config/firebase');
const { AuthenticationError } = require('../utils/errors');
const { getDatabase } = require('../repositories/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      const db = getDatabase();
      // Find or create user in our DB based on Firebase data
      let user = await db.findUserById(decodedToken.uid);
      
      if (!user) {
        // Automatically provision user in our database if they logged in via Firebase
        const email = decodedToken.email || `${decodedToken.uid}@firebase.local`;
        
        // Determine role (first user gets admin if configured)
        let role = 'user';
        const config = require('../config/env');
        if (config.AUTH.FIRST_USER_ADMIN) {
          const existingUsers = await db.getAllUsers ? await db.getAllUsers() : [];
          if (existingUsers.length === 0) {
            role = 'admin';
          }
        }
        
        user = await db.createUser({
          id: decodedToken.uid,
          username: email.split('@')[0],
          email: email,
          role: role
        });
      }

      req.user = user;
      next();
    } catch (err) {
      console.error('Firebase Auth Error:', err);
      throw new AuthenticationError('Invalid or expired Firebase token');
    }
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
