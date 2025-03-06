#!/usr/bin/env node

const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

// DynamoDB local configuration
const dynamoClient = new DynamoDBClient({
  region: 'local',
  endpoint: 'http://localhost:8000',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

// Table names
const RETENTION_POLICY_TABLE = process.env.DYNAMODB_RETENTION_POLICY_TABLE || 'document-processor-retention-policies';

// Define table schemas
const tables = [
  {
    name: RETENTION_POLICY_TABLE,
    schema: {
      TableName: RETENTION_POLICY_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' }
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }
  }
];

async function createTables() {
  try {
    console.log('Setting up local DynamoDB tables');
    
    // List existing tables
    const { TableNames } = await dynamoClient.send(new ListTablesCommand({}));
    console.log('Existing tables:', TableNames);
    
    // Create tables if they don't exist
    for (const table of tables) {
      if (TableNames.includes(table.name)) {
        console.log(`Table ${table.name} already exists, skipping`);
        continue;
      }
      
      console.log(`Creating table ${table.name}...`);
      await dynamoClient.send(new CreateTableCommand(table.schema));
      console.log(`Table ${table.name} created successfully!`);
    }
    
    console.log('All tables created successfully!');
  } catch (error) {
    console.error('Error setting up tables:', error);
    process.exit(1);
  }
}

createTables().catch(console.error); 