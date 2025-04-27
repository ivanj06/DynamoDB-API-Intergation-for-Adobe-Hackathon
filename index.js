require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { docClient, s3Client } = require('./config/dynamodb');
const { PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

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

// Add a new version to a document (with optional nodes)
app.post('/api/:documentId/versions', async (req, res) => {
  try {
    const { title, username, userid, description, timestamp, nodes } = req.body;
    if (!title || !username || !userid || !timestamp) {
      return res.status(400).json({
        success: false,
        message: "Title, username, userid, and timestamp are required"
      });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: req.params.documentId }
    });
    const existingDoc = await docClient.send(getCommand);
    const currentUsers = existingDoc.Item?.users || {};
    const currentVersions = existingDoc.Item?.versions || {};
    const newVersion = {
      title,
      username,
      userid,
      description: description || "",
      nodes: nodes || {}
    };
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

// Add or update a node in a version
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { x, y } = req.body;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return res.status(400).json({
        success: false,
        message: "x and y must be integers"
      });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({
        success: false,
        message: "Version not found"
      });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    version.nodes[nodeId] = { x, y };
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({
      success: true,
      message: "Node added/updated successfully",
      node: { x, y },
      nodeId
    });
  } catch (error) {
    console.error('Error adding/updating node:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add/update node',
      message: error.message
    });
  }
});

// Get all nodes for a version
app.get('/api/:documentId/versions/:timestamp/nodes', async (req, res) => {
  try {
    const { documentId, timestamp } = req.params;
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({
        success: false,
        message: "Version not found"
      });
    }
    const nodes = doc.Item.versions[timestamp].nodes || {};
    res.json({
      success: true,
      nodes
    });
  } catch (error) {
    console.error('Error getting nodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get nodes',
      message: error.message
    });
  }
});

// Upload file to S3 (single PDF upload)
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

// Download file from S3 (single PDF download)
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

// Get all JPEG images for a version
app.get('/api/:documentId/versions/:timestamp/images', async (req, res) => {
  try {
    const { documentId, timestamp } = req.params;
    
    // List all JPEG files in the images folder for this version
    const command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: `${documentId}/${timestamp}/images/`,
      // Filter for JPEG files
      Filter: {
        Suffix: '.jpeg'
      }
    });

    const response = await s3Client.send(command);
    
    if (!response.Contents || response.Contents.length === 0) {
      return res.json({
        success: true,
        message: "No images found",
        images: []
      });
    }

    // Map the S3 objects to image URLs
    const images = response.Contents.map(file => ({
      name: file.Key.split('/').pop(),
      size: file.Size,
      lastModified: file.LastModified,
      url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${file.Key}`
    }));

    res.json({
      success: true,
      message: "Images retrieved successfully",
      images
    });
  } catch (error) {
    console.error('Error getting images:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get images',
      message: error.message
    });
  }
});

// Delete a version from DynamoDB (but keep S3 files)
app.delete('/api/:documentId/versions/:timestamp', async (req, res) => {
  try {
    const { documentId, timestamp } = req.params;

    // First get the existing document
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: documentId
      }
    });

    const existingDoc = await docClient.send(getCommand);
    
    if (!existingDoc.Item) {
      return res.status(404).json({
        success: false,
        message: "Document not found"
      });
    }

    const currentVersions = existingDoc.Item.versions || {};
    const currentUsers = existingDoc.Item.users || {};

    // Check if version exists
    if (!currentVersions[timestamp]) {
      return res.status(404).json({
        success: false,
        message: "Version not found"
      });
    }

    // Remove the version
    delete currentVersions[timestamp];

    // Update the document
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: currentUsers,
        versions: currentVersions
      }
    });

    await docClient.send(putCommand);

    res.json({
      success: true,
      message: "Version deleted successfully",
      documentId: documentId,
      timestamp: timestamp
    });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete version',
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

// Nested routes for version comparisons
app.get('/api/:documentId/versions/:timestamp1/compare/:timestamp2', async (req, res) => {
  try {
    const { documentId, timestamp1, timestamp2 } = req.params;

    // Get both versions
    const getCommand1 = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: documentId
      }
    });

    const doc = await docClient.send(getCommand1);
    const version1 = doc.Item?.versions?.[timestamp1];
    const version2 = doc.Item?.versions?.[timestamp2];

    if (!version1 || !version2) {
      return res.status(404).json({
        success: false,
        message: "One or both versions not found"
      });
    }

    // Compare versions
    const comparison = {
      version1: {
        timestamp: timestamp1,
        ...version1
      },
      version2: {
        timestamp: timestamp2,
        ...version2
      },
      differences: {
        // Add comparison logic here
        title: version1.title !== version2.title,
        description: version1.description !== version2.description,
        // Add more comparison fields as needed
      }
    };

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    console.error('Error comparing versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare versions',
      message: error.message
    });
  }
});

// Nested routes for file management
app.get('/api/:documentId/versions/:timestamp/files/:fileType', async (req, res) => {
  try {
    const { documentId, timestamp, fileType } = req.params;

    // List files in S3
    const command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: `${documentId}/${timestamp}/${fileType}/`
    });

    const response = await s3Client.send(command);
    
    const files = response.Contents?.map(file => ({
      name: file.Key.split('/').pop(),
      size: file.Size,
      lastModified: file.LastModified
    })) || [];

    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list files',
      message: error.message
    });
  }
});

// Nested routes for user activity
app.get('/api/:documentId/versions/:timestamp/users/:userId/activity', async (req, res) => {
  try {
    const { documentId, timestamp, userId } = req.params;

    // Get document
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: {
        Documentid: documentId
      }
    });

    const doc = await docClient.send(getCommand);
    const version = doc.Item?.versions?.[timestamp];
    const user = doc.Item?.users?.[userId];

    if (!version || !user) {
      return res.status(404).json({
        success: false,
        message: "Version or user not found"
      });
    }

    // Get user's activity in this version
    const activity = {
      userId,
      nickname: user,
      versionTimestamp: timestamp,
      versionTitle: version.title,
      versionDescription: version.description,
      // Add more activity details as needed
    };

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('Error getting user activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user activity',
      message: error.message
    });
  }
});

// 1. Create a node with a string ID (default x, y = 0)
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/create', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    version.nodes[nodeId] = { x: 0, y: 0 };
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node created with default values", nodeId });
  } catch (error) {
    console.error('Error creating node:', error);
    res.status(500).json({ success: false, error: 'Failed to create node', message: error.message });
  }
});

// 2. Update x and y coordinates for a node
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/xy', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { x, y } = req.body;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return res.status(400).json({ success: false, message: "x and y must be integers" });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    if (!version.nodes[nodeId]) {
      return res.status(404).json({ success: false, message: "Node not found" });
    }
    version.nodes[nodeId].x = x;
    version.nodes[nodeId].y = y;
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node x and y updated", nodeId, x, y });
  } catch (error) {
    console.error('Error updating node x/y:', error);
    res.status(500).json({ success: false, error: 'Failed to update node x/y', message: error.message });
  }
});

// 3. Update rotation for a node
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/rotation', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { rotation } = req.body;
    if (!Number.isInteger(rotation)) {
      return res.status(400).json({ success: false, message: "rotation must be an integer" });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    if (!version.nodes[nodeId]) {
      return res.status(404).json({ success: false, message: "Node not found" });
    }
    version.nodes[nodeId].rotation = rotation;
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node rotation updated", nodeId, rotation });
  } catch (error) {
    console.error('Error updating node rotation:', error);
    res.status(500).json({ success: false, error: 'Failed to update node rotation', message: error.message });
  }
});

// Update only the x coordinate for a node
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/x', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { x } = req.body;
    if (!Number.isInteger(x)) {
      return res.status(400).json({ success: false, message: "x must be an integer" });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    if (!version.nodes[nodeId]) {
      return res.status(404).json({ success: false, message: "Node not found" });
    }
    version.nodes[nodeId].x = x;
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node x updated", nodeId, x });
  } catch (error) {
    console.error('Error updating node x:', error);
    res.status(500).json({ success: false, error: 'Failed to update node x', message: error.message });
  }
});

// Update only the y coordinate for a node
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/y', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { y } = req.body;
    if (!Number.isInteger(y)) {
      return res.status(400).json({ success: false, message: "y must be an integer" });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    if (!version.nodes[nodeId]) {
      return res.status(404).json({ success: false, message: "Node not found" });
    }
    version.nodes[nodeId].y = y;
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node y updated", nodeId, y });
  } catch (error) {
    console.error('Error updating node y:', error);
    res.status(500).json({ success: false, error: 'Failed to update node y', message: error.message });
  }
});

// Update width for a node
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/width', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { width } = req.body;
    if (!Number.isInteger(width)) {
      return res.status(400).json({ success: false, message: "width must be an integer" });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    if (!version.nodes[nodeId]) {
      return res.status(404).json({ success: false, message: "Node not found" });
    }
    version.nodes[nodeId].width = width;
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node width updated", nodeId, width });
  } catch (error) {
    console.error('Error updating node width:', error);
    res.status(500).json({ success: false, error: 'Failed to update node width', message: error.message });
  }
});

// Update height for a node
app.post('/api/:documentId/versions/:timestamp/nodes/:nodeId/height', async (req, res) => {
  try {
    const { documentId, timestamp, nodeId } = req.params;
    const { height } = req.body;
    if (!Number.isInteger(height)) {
      return res.status(400).json({ success: false, message: "height must be an integer" });
    }
    const getCommand = new GetCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Key: { Documentid: documentId }
    });
    const doc = await docClient.send(getCommand);
    if (!doc.Item || !doc.Item.versions || !doc.Item.versions[timestamp]) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }
    const version = doc.Item.versions[timestamp];
    version.nodes = version.nodes || {};
    if (!version.nodes[nodeId]) {
      return res.status(404).json({ success: false, message: "Node not found" });
    }
    version.nodes[nodeId].height = height;
    const putCommand = new PutCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME,
      Item: {
        Documentid: documentId,
        users: doc.Item.users || {},
        versions: {
          ...doc.Item.versions,
          [timestamp]: version
        }
      }
    });
    await docClient.send(putCommand);
    res.json({ success: true, message: "Node height updated", nodeId, height });
  } catch (error) {
    console.error('Error updating node height:', error);
    res.status(500).json({ success: false, error: 'Failed to update node height', message: error.message });
  }
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