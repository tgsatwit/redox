// Script to create prompt-related tables in local or AWS DynamoDB
const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
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
  const requiredEnvVars = [
    'APP_REGION', 
    'APP_ACCESS_KEY_ID', 
    'APP_SECRET_ACCESS_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`${envVar} environment variable is not set`);
    }
  }
  
  return {
    region: process.env.APP_REGION,
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
const dynamoClient = new DynamoDBClient(getDynamoDBConfig());

// Setup prompt categories table
async function setupPromptCategoriesTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(PROMPT_CATEGORIES_TABLE);
    
    if (tableExists) {
      console.log(`Table '${PROMPT_CATEGORIES_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: PROMPT_CATEGORIES_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    };
    
    console.log(`Creating DynamoDB table: ${PROMPT_CATEGORIES_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${PROMPT_CATEGORIES_TABLE} table:`, error);
  }
}

// Setup prompts table
async function setupPromptsTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(PROMPTS_TABLE);
    
    if (tableExists) {
      console.log(`Table '${PROMPTS_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: PROMPTS_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'categoryId', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'categoryId-index',
          KeySchema: [
            { AttributeName: 'categoryId', KeyType: 'HASH' }
          ],
          Projection: {
            ProjectionType: 'ALL'
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    };
    
    console.log(`Creating DynamoDB table: ${PROMPTS_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${PROMPTS_TABLE} table:`, error);
  }
}

async function setupPromptTables() {
  try {
    await setupPromptCategoriesTable();
    await setupPromptsTable();
    console.log('All prompt-related DynamoDB tables created successfully');
  } catch (error) {
    console.error('Error setting up prompt-related DynamoDB tables:', error);
    process.exit(1);
  }
}

// Execute all setups
setupPromptTables()
  .then(() => {
    console.log('Prompt tables DynamoDB setup completed successfully');
  })
  .catch(error => {
    console.error('Error in prompt tables DynamoDB setup:', error);
    process.exit(1);
  }); 