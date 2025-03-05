// Script to create DynamoDB table for classification feedback
const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config({ path: '.env.local' });

// Get AWS credentials from environment
const awsConfig = {
  region: process.env.APP_REGION,
  credentials: {
    accessKeyId: process.env.APP_ACCESS_KEY_ID,
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY
  }
};

// Table name from environment
const tableName = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE;

if (!tableName) {
  console.error('Error: DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE environment variable is not set');
  process.exit(1);
}

// Create DynamoDB client
const dynamoClient = new DynamoDBClient(awsConfig);

async function setupDynamoDBTable() {
  try {
    // First, check if the table already exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(tableName);

    if (tableExists) {
      console.log(`Table '${tableName}' already exists.`);
      return;
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

    // Create the table
    console.log(`Creating DynamoDB table: ${tableName}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse);
  } catch (error) {
    console.error('Error setting up DynamoDB table:', error);
    process.exit(1);
  }
}

// Run the setup
setupDynamoDBTable()
  .then(() => {
    console.log('DynamoDB setup completed successfully');
  })
  .catch(error => {
    console.error('Error in DynamoDB setup:', error);
    process.exit(1);
  }); 