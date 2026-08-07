const multer = require('multer');

// Memory storage for small file uploads or chunk handling if needed
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for general uploads (e.g. avatars)
  }
});

module.exports = upload;
