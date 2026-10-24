// Vercel Serverless Entry Point
// Set VERCEL env early so server.js knows to skip app.listen() and sample data creation
process.env.VERCEL = '1';

let app;
try {
  app = require('../server.js');
} catch (err) {
  const express = require('express');
  app = express();
  app.use((req, res) => {
    res.status(500).json({
      error: 'Server initialization failed',
      message: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  });
}

module.exports = app;
