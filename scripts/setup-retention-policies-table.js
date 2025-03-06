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
    region: process.env.APP_REGION || 'ap-southeast-2',
    credentials: {
      accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
    }
  };
};

// Table name from environment or default
const RETENTION_POLICY_TABLE = process.env.DYNAMODB_RETENTION_POLICY_TABLE || 'document-processor-retention-policies';

// Create DynamoDB client
const dynamoClient = new DynamoDBClient(getDynamoDBConfig());

// Setup retention policies table
async function setupRetentionPoliciesTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(RETENTION_POLICY_TABLE);
    
    if (tableExists) {
      console.log(`Table '${RETENTION_POLICY_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: RETENTION_POLICY_TABLE,
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
    
    console.log(`Creating DynamoDB table: ${RETENTION_POLICY_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${RETENTION_POLICY_TABLE} table:`, error);
  }
}

// Execute setup
setupRetentionPoliciesTable()
  .then(() => {
    console.log('Retention policies table DynamoDB setup completed successfully');
  })
  .catch(error => {
    console.error('Error in retention policies table DynamoDB setup:', error);
    process.exit(1);
  }); 