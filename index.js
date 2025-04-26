const express = require('express');
const app = express();

// Hello World function
const helloWorld = () => {
  console.log("Hello World");
  return "Hello World";
};

// API endpoint that uses the helloWorld function
app.get('/api/hello', (req, res) => {
  const message = helloWorld();
  res.json({ message });
});

// Handle all other routes
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Export the Express API
module.exports = app; 