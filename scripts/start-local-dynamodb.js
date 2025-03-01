// Script to start a local DynamoDB instance and create the necessary table
const { spawn } = require('child_process');
const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
require('dotenv').config({ path: '.env.local' });

// Local DynamoDB configuration
const LOCAL_DYNAMODB_PORT = 8000;
const LOCAL_DYNAMODB_ENDPOINT = `http://localhost:${LOCAL_DYNAMODB_PORT}`;

// Table name from environment
const tableName = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE || 'document-classification-feedback';

// Create DynamoDB client for local instance
const dynamoClient = new DynamoDBClient({
  region: 'local',
  endpoint: LOCAL_DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

// Start local DynamoDB
function startLocalDynamoDB() {
  console.log(`Starting local DynamoDB on port ${LOCAL_DYNAMODB_PORT}...`);
  
  // Use dynamodb-local package to start the local instance
  const dynamoProcess = spawn('npx', ['dynamodb-local', '-port', LOCAL_DYNAMODB_PORT.toString()]);
  
  dynamoProcess.stdout.on('data', (data) => {
    console.log(`DynamoDB Local: ${data}`);
  });
  
  dynamoProcess.stderr.on('data', (data) => {
    console.error(`DynamoDB Local Error: ${data}`);
  });
  
  dynamoProcess.on('close', (code) => {
    console.log(`DynamoDB Local process exited with code ${code}`);
  });
  
  // Give DynamoDB some time to start up
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Local DynamoDB should be running now');
      resolve();
    }, 2000);
  });
}

// Create the feedback table in local DynamoDB
async function createFeedbackTable() {
  try {
    // First, check if the table already exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(tableName);

    if (tableExists) {
      console.log(`Table '${tableName}' already exists in local DynamoDB.`);
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
    console.log(`Creating table '${tableName}' in local DynamoDB...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully in local DynamoDB:', createTableResponse.TableDescription.TableName);
    
    console.log('\nLocal DynamoDB is running with the feedback table created.');
    console.log(`Endpoint: ${LOCAL_DYNAMODB_ENDPOINT}`);
    console.log('To use this local DynamoDB with your application, update your .env.local file:');
    console.log('DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000');
    console.log('\nPress Ctrl+C to stop the local DynamoDB server.\n');
  } catch (error) {
    console.error('Error creating table in local DynamoDB:', error);
    process.exit(1);
  }
}

// Run the setup
async function run() {
  try {
    await startLocalDynamoDB();
    await createFeedbackTable();
  } catch (error) {
    console.error('Error setting up local DynamoDB:', error);
    process.exit(1);
  }
}

run(); 