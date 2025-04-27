require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { docClient, s3Client } = require('./config/dynamodb');
const { PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const app = express();

// Enable CORS for all routes
app.use(cors());

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
app.get('/api/:documentId/users/:userId', async (req, res) => {
  try {
    const command = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.documentId
      }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
      return res.json({
        success: false,
        message: "No document found"
      });
    }

    // Check if user exists in the users object
    const users = response.Item.users || {};
    if (users[req.params.userId]) {
      res.json({
        success: true,
        nickname: users[req.params.userId]
      });
    } else {
      res.json({
        success: false,
        message: "No nickname found for this user"
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
app.post('/api/:documentId/users/:userId', async (req, res) => {
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
        Documentid: req.params.documentId
      }
    });

    const existingDoc = await docClient.send(getCommand);
    const currentUsers = existingDoc.Item?.users || {};
    const currentVersions = existingDoc.Item?.versions || {};

    // If user already has a nickname, don't allow update
    if (currentUsers[req.params.userId]) {
      return res.status(400).json({
        success: false,
        message: "Nickname already exists for this user"
      });
    }

    // Create or update document with new user nickname
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: req.params.documentId,
        users: {
          ...currentUsers,
          [req.params.userId]: nickname
        },
        versions: currentVersions
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

// Get all users in a document
app.get('/api/:documentId', async (req, res) => {
  try {
    const command = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.documentId
      }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
      return res.json({
        success: false,
        message: "No document found"
      });
    }

    res.json({
      success: true,
      users: response.Item.users || {},
      versions: response.Item.versions || {}
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

// Get only versions for a specific document
app.get('/api/:documentId/versions', async (req, res) => {
  try {
    const command = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.documentId
      }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
      return res.json({
        success: false,
        message: "No document found"
      });
    }

    res.json({
      success: true,
      versions: response.Item.versions || {}
    });
  } catch (error) {
    console.error('Error getting versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get versions',
      message: error.message
    });
  }
});

// Add a new version to a document
app.post('/api/:documentId/versions', async (req, res) => {
  try {
    const { title, username, userid, description } = req.body;
    
    // Validate required fields
    if (!title || !username || !userid) {
      return res.status(400).json({
        success: false,
        message: "Title, username, and userid are required"
      });
    }

    // First get the existing document
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: req.params.documentId
      }
    });

    const existingDoc = await docClient.send(getCommand);
    const currentUsers = existingDoc.Item?.users || {};
    const currentVersions = existingDoc.Item?.versions || {};

    // Generate Unix timestamp for the version key
    const timestamp = Math.floor(Date.now() / 1000);

    // Create new version object
    const newVersion = {
      title,
      username,
      userid,
      description: description || ""
    };

    // Update document with new version
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: req.params.documentId,
        users: currentUsers,
        versions: {
          ...currentVersions,
          [timestamp]: newVersion
        }
      }
    });

    await docClient.send(putCommand);
    
    res.status(201).json({
      success: true,
      message: "Version added successfully",
      version: newVersion,
      timestamp: timestamp
    });
  } catch (error) {
    console.error('Error adding version:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add version',
      message: error.message
    });
  }
});

// Upload file to S3
app.post('/api/:documentId/versions/:timestamp/upload', express.raw({ type: ['application/pdf', 'image/jpeg'], limit: '100mb' }), async (req, res) => {
  try {
    const { documentId, timestamp } = req.params;
    const { fileType, fileName } = req.query;

    if (!fileType || !fileName) {
      return res.status(400).json({
        success: false,
        message: "File type and file name are required"
      });
    }

    const key = `${documentId}/${timestamp}/${fileType}/${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: req.body,
      ContentType: req.headers['content-type']
    });

    await s3Client.send(command);

    res.json({
      success: true,
      message: "File uploaded successfully",
      key: key
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      message: error.message
    });
  }
});

// Download file from S3
app.get('/api/:documentId/versions/:timestamp/download', async (req, res) => {
  try {
    const { documentId, timestamp } = req.params;
    const { fileType, fileName } = req.query;
    
    if (!fileType || !fileName) {
      return res.status(400).json({
        success: false,
        message: "File type and file name are required"
      });
    }

    const key = `${documentId}/${timestamp}/${fileType}/${fileName}`;
    
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    });

    const response = await s3Client.send(command);
    
    // Set appropriate headers
    res.setHeader('Content-Type', response.ContentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Stream the file to the response
    response.Body.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file',
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