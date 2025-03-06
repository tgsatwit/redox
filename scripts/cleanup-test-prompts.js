// Script to clean up test prompt categories and prompts
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  ScanCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');
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

// Table names
const PROMPT_CATEGORIES_TABLE = process.env.DYNAMODB_PROMPT_CATEGORIES_TABLE || 'document-processor-prompt-categories';
const PROMPTS_TABLE = process.env.DYNAMODB_PROMPTS_TABLE || 'document-processor-prompts';

// Create DynamoDB client
const client = new DynamoDBClient(getDynamoDBConfig());
const docClient = DynamoDBDocumentClient.from(client);

// Test category names to delete
const TEST_CATEGORY_NAMES = ["Test Category"];

async function cleanupTestCategories() {
  try {
    console.log('Starting cleanup of test categories...');
    
    // 1. Scan categories to find test ones
    console.log('Scanning categories table...');
    const categoriesResponse = await docClient.send(
      new ScanCommand({
        TableName: PROMPT_CATEGORIES_TABLE
      })
    );
    
    const testCategories = categoriesResponse.Items.filter(category => 
      TEST_CATEGORY_NAMES.includes(category.name)
    );
    
    console.log(`Found ${testCategories.length} test categories to delete`);
    
    // 2. For each test category, find and delete its prompts
    for (const category of testCategories) {
      console.log(`Processing category: ${category.name} (${category.id})`);
      
      // Find prompts for this category
      const promptsResponse = await docClient.send(
        new ScanCommand({
          TableName: PROMPTS_TABLE,
          FilterExpression: 'categoryId = :categoryId',
          ExpressionAttributeValues: {
            ':categoryId': category.id
          }
        })
      );
      
      console.log(`Found ${promptsResponse.Items.length} prompts to delete for category ${category.id}`);
      
      // Delete each prompt
      for (const prompt of promptsResponse.Items) {
        console.log(`Deleting prompt: ${prompt.id}`);
        await docClient.send(
          new DeleteCommand({
            TableName: PROMPTS_TABLE,
            Key: { id: prompt.id }
          })
        );
      }
      
      // Delete the category
      console.log(`Deleting category: ${category.id}`);
      await docClient.send(
        new DeleteCommand({
          TableName: PROMPT_CATEGORIES_TABLE,
          Key: { id: category.id }
        })
      );
    }
    
    console.log('Cleanup completed successfully!');
  } catch (error) {
    console.error('Error cleaning up test categories:', error);
  }
}

// Run the cleanup
cleanupTestCategories(); 