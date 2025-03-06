#!/usr/bin/env node

const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Get the DynamoDB configuration
const getDynamoDBConfig = () => {
  const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
  
  console.log('AWS Credentials:', {
    region: process.env.APP_REGION || 'us-east-1',
    accessKeyId: process.env.APP_ACCESS_KEY_ID ? 'Set' : 'Not set',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY ? 'Set' : 'Not set'
  });
  
  if (localEndpoint) {
    console.log('Using local DynamoDB endpoint:', localEndpoint);
    return {
      region: 'local',
      endpoint: localEndpoint,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
      }
    };
  }
  
  console.log('Using AWS DynamoDB in region:', process.env.APP_REGION || 'us-east-1');
  return {
    region: process.env.APP_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
    }
  };
};

// Table names
const RETENTION_POLICY_TABLE = process.env.DYNAMODB_RETENTION_POLICY_TABLE || 'document-processor-retention-policies';

async function debugDynamoDB() {
  try {
    console.log('===== DynamoDB Debug Script =====');
    
    // Create DynamoDB clients
    const config = getDynamoDBConfig();
    console.log('\nDynamoDB Configuration:', config);
    
    const dynamoClient = new DynamoDBClient(config);
    const docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
    
    // List tables
    console.log('\nAttempting to list DynamoDB tables...');
    const { TableNames } = await dynamoClient.send(new ListTablesCommand({}));
    console.log('Tables found:', TableNames);
    
    // Check if our retention policy table exists
    const retentionTableExists = TableNames.includes(RETENTION_POLICY_TABLE);
    console.log(`\nRetention Policy Table (${RETENTION_POLICY_TABLE}) exists: ${retentionTableExists}`);
    
    if (retentionTableExists) {
      // Try to scan the table
      console.log('\nAttempting to scan retention policies table...');
      const scanResult = await docClient.send(
        new ScanCommand({
          TableName: RETENTION_POLICY_TABLE
        })
      );
      
      console.log(`Found ${scanResult.Items?.length || 0} policies`);
      console.log('Sample of policies:', scanResult.Items?.slice(0, 3));
      
      // Try adding a test policy
      console.log('\nAttempting to add a test policy...');
      const testPolicy = {
        id: `test-${Date.now()}`,
        name: 'Debug Test Policy',
        description: 'Created by debug script',
        duration: 365,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await docClient.send({
        TableName: RETENTION_POLICY_TABLE,
        Item: testPolicy
      });
      
      console.log('Test policy successfully added!');
    }
    
    console.log('\n===== Debug Complete =====');
  } catch (error) {
    console.error('Error during DynamoDB debugging:', error);
  }
}

debugDynamoDB().catch(console.error); 