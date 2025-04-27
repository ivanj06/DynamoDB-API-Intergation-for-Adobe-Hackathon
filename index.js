require('dotenv').config();
const express = require('express');
const { docClient } = require('./config/dynamodb');
const { PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();

// Enable JSON parsing
app.use(express.json());

// Create/Update document
app.post('/api/documents', async (req, res) => {
  try {
    const command = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: req.body
    });

    await docClient.send(command);
    res.status(201).json({
      success: true,
      message: 'Document created successfully',
      document: req.body
    });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create document',
      message: error.message
    });
  }
});

// Get document by Documentid
app.get('/api/documents/:documentId', async (req, res) => {
  try {
    const command = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.documentId
      }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      document: response.Item
    });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document',
      message: error.message
    });
  }
});

// Get all documents
app.get('/api/documents', async (req, res) => {
  try {
    const command = new ScanCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME
    });

    const response = await docClient.send(command);
    
    res.json({
      success: true,
      documents: response.Items
    });
  } catch (error) {
    console.error('Error scanning documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get documents',
      message: error.message
    });
  }
});

// Get or check nickname endpoint
app.get('/api/:documentId/:userId', async (req, res) => {
  try {
    const command = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.userId
      }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
      return res.json({
        success: false,
        message: "No document found"
      });
    }

    // If nickname exists, return it
    if (response.Item.nickname) {
      res.json({
        success: true,
        nickname: response.Item.nickname
      });
    } else {
      res.json({
        success: false,
        message: "No nickname found"
      });
    }
  } catch (error) {
    console.error('Error checking nickname:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check nickname',
      message: error.message
    });
  }
});

// Set nickname endpoint
app.post('/api/:documentId/:userId', async (req, res) => {
  try {
    const { nickname } = req.body;
    
    if (!nickname) {
      return res.status(400).json({
        success: false,
        message: "Nickname is required"
      });
    }

    // First check if document exists
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.userId
      }
    });

    const existingDoc = await docClient.send(getCommand);

    // If document exists and has a nickname, don't allow update
    if (existingDoc.Item && existingDoc.Item.nickname) {
      return res.status(400).json({
        success: false,
        message: "Nickname already exists for this user"
      });
    }

    // Create or update document with nickname
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: req.params.userId,
        nickname: nickname,
        ...(existingDoc.Item || {}) // Preserve other fields if document exists
      }
    });

    await docClient.send(putCommand);
    
    res.json({
      success: true,
      message: "Nickname set successfully",
      nickname: nickname
    });
  } catch (error) {
    console.error('Error setting nickname:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set nickname',
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