let app;
try {
  app = require('../src/master/server');
} catch (err) {
  // If the server fails to load, create a dummy express app that just returns the error
  const express = require('express');
  app = express();
  app.use((req, res) => {
    res.status(500).json({
      error: 'Failed to initialize server',
      message: err.message,
      stack: err.stack,
      env: process.env.NODE_ENV,
      mode: process.env.MODE
    });
  });
}

module.exports = app;
