require('dotenv').config();
const express = require('express');
const { docClient } = require('./config/dynamodb');
const { PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();

// Enable JSON parsing
app.use(express.json());

// Hello World function
const helloWorld = () => {
  console.log("Hello World");
  return "Hello World";
};

// Example DynamoDB endpoints

// Create/Update item
app.post('/api/items', async (req, res) => {
  try {
    const command = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: req.body
    });

    await docClient.send(command);
    res.status(201).json({
      success: true,
      message: 'Item created successfully',
      item: req.body
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create item',
      message: error.message
    });
  }
});

// Get item by ID
app.get('/api/items/:id', async (req, res) => {
  try {
    const command = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        id: req.params.id
      }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Item not found'
      });
    }

    res.json({
      success: true,
      item: response.Item
    });
  } catch (error) {
    console.error('Error getting item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get item',
      message: error.message
    });
  }
});

// Get all items
app.get('/api/items', async (req, res) => {
  try {
    const command = new ScanCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME
    });

    const response = await docClient.send(command);
    
    res.json({
      success: true,
      items: response.Items
    });
  } catch (error) {
    console.error('Error scanning items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get items',
      message: error.message
    });
  }
});

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

// Start the server when running locally
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export the Express API
module.exports = app; 