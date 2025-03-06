// Script to test prompt tables in DynamoDB
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  ScanCommand, 
  QueryCommand 
} = require('@aws-sdk/lib-dynamodb');
const { createId } = require('@paralleldrive/cuid2');
require('dotenv').config({ path: '.env.local' });

// Get DynamoDB client configuration
const getDynamoDBConfig = () => {
  // Check if we're using local DynamoDB
  const localEndpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
  
  if (localEndpoint) {
    console.log(`Using local DynamoDB at ${localEndpoint}`);
    return {
      region: 'local',
      endpoint: localEndpoint,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local'
      }
    };
  }
  
  // Otherwise, use AWS credentials
  console.log('Using AWS DynamoDB in region:', process.env.APP_REGION || 'ap-southeast-2');
  return {
    region: process.env.APP_REGION || 'ap-southeast-2',
    credentials: {
      accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
    }
  };
};

// Table names from environment or defaults
const PROMPT_CATEGORIES_TABLE = process.env.DYNAMODB_PROMPT_CATEGORIES_TABLE || 'document-processor-prompt-categories';
const PROMPTS_TABLE = process.env.DYNAMODB_PROMPTS_TABLE || 'document-processor-prompts';

// Create DynamoDB client
const client = new DynamoDBClient(getDynamoDBConfig());
const docClient = DynamoDBDocumentClient.from(client);

// Test data
const testCategory = {
  id: createId(),
  name: 'Test Category',
  description: 'Test Category Description',
  prompts: []
};

const testPrompt = {
  id: createId(),
  name: 'Test Prompt',
  description: 'Test Prompt Description',
  role: 'system',
  content: 'This is a test prompt content.',
  isActive: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  categoryId: testCategory.id
};

async function testPromptTables() {
  try {
    console.log('Starting prompt tables test...');
    
    // 1. Add a test category
    console.log('Adding test category:', testCategory);
    await docClient.send(
      new PutCommand({
        TableName: PROMPT_CATEGORIES_TABLE,
        Item: testCategory
      })
    );
    console.log('Test category added successfully');
    
    // 2. Add a test prompt
    console.log('Adding test prompt:', testPrompt);
    await docClient.send(
      new PutCommand({
        TableName: PROMPTS_TABLE,
        Item: testPrompt
      })
    );
    console.log('Test prompt added successfully');
    
    // 3. Scan categories to verify
    console.log('Scanning categories table...');
    const categoriesResponse = await docClient.send(
      new ScanCommand({
        TableName: PROMPT_CATEGORIES_TABLE
      })
    );
    console.log('Categories in DynamoDB:', categoriesResponse.Items);
    
    // 4. Query prompts for the category using scan with filter
    console.log('Scanning prompts for category:', testCategory.id);
    const promptsResponse = await docClient.send(
      new ScanCommand({
        TableName: PROMPTS_TABLE,
        FilterExpression: 'categoryId = :categoryId',
        ExpressionAttributeValues: {
          ':categoryId': testCategory.id
        }
      })
    );
    console.log('Prompts for category:', promptsResponse.Items);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing prompt tables:', error);
  }
}

// Run the test
testPromptTables(); 