// Script to create tables in local or AWS DynamoDB
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
    'AWS_REGION', 
    'AWS_ACCESS_KEY_ID', 
    'AWS_SECRET_ACCESS_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`${envVar} environment variable is not set`);
    }
  }
  
  return {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
  };
};

// Table name from environment
const tableName = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE || 'document-classification-feedback';

// Create DynamoDB client
const dynamoClient = new DynamoDBClient(getDynamoDBConfig());

async function setupFeedbackTable() {
  try {
    // First, check if the table already exists
    let tableExists = false;
    
    try {
      const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
      tableExists = listTablesResponse.TableNames.includes(tableName);
      
      if (tableExists) {
        console.log(`Table '${tableName}' already exists.`);
        return;
      }
    } catch (listError) {
      console.error('Error listing tables:', listError);
      // Continue with table creation attempt
    }

    // Table definition for classification feedback
    const tableParams = {
      TableName: tableName,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'documentId', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'N' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'documentId-index',
          KeySchema: [
            { AttributeName: 'documentId', KeyType: 'HASH' }
          ],
          Projection: {
            ProjectionType: 'ALL'
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        },
        {
          IndexName: 'timestamp-index',
          KeySchema: [
            { AttributeName: 'timestamp', KeyType: 'HASH' }
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

    console.log(`Creating DynamoDB table: ${tableName}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error('Error setting up DynamoDB table:', error);
    process.exit(1);
  }
}

// Run the setup
setupFeedbackTable()
  .then(() => {
    console.log('DynamoDB setup completed successfully');
  })
  .catch(error => {
    console.error('Error in DynamoDB setup:', error);
    process.exit(1);
  }); 