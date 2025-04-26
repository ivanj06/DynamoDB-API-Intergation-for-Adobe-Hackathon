const express = require('express');
const app = express();

// Enable JSON parsing
app.use(express.json());

// Hello World function
const helloWorld = () => {
  console.log("Hello World");
  return "Hello World";
};

// API endpoint that uses the helloWorld function
app.get('/api/hello', (req, res) => {
  try {
    const message = helloWorld();
    res.status(200).json({ 
      success: true,
      message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Handle all other routes
app.get('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

// Export the Express API
module.exports = app; 