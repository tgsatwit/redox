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
const FEEDBACK_TABLE = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE || 'document-classification-feedback';
const CONFIG_TABLE = process.env.DYNAMODB_CONFIG_TABLE || 'document-processor-config';
const DOC_TYPE_TABLE = process.env.DYNAMODB_DOCTYPE_TABLE || 'document-processor-doctypes';
const SUB_TYPE_TABLE = process.env.DYNAMODB_SUBTYPE_TABLE || 'document-processor-subtypes';
const DATA_ELEMENT_TABLE = process.env.DYNAMODB_ELEMENT_TABLE || 'document-processor-elements';
const TRAINING_DATASET_TABLE = process.env.DYNAMODB_DATASET_TABLE || 'document-processor-datasets';
const TRAINING_EXAMPLE_TABLE = process.env.DYNAMODB_EXAMPLE_TABLE || 'document-processor-examples';
const PROMPT_CATEGORIES_TABLE = process.env.DYNAMODB_PROMPT_CATEGORIES_TABLE || 'document-processor-prompt-categories';
const PROMPTS_TABLE = process.env.DYNAMODB_PROMPTS_TABLE || 'document-processor-prompts';
const RETENTION_POLICY_TABLE = process.env.DYNAMODB_RETENTION_POLICY_TABLE || 'document-processor-retention-policies';

// Create DynamoDB client
const dynamoClient = new DynamoDBClient(getDynamoDBConfig());

async function setupFeedbackTable() {
  try {
    // First, check if the table already exists
    let tableExists = false;
    
    try {
      const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
      tableExists = listTablesResponse.TableNames.includes(FEEDBACK_TABLE);
      
      if (tableExists) {
        console.log(`Table '${FEEDBACK_TABLE}' already exists.`);
        return;
      }
    } catch (listError) {
      console.error('Error listing tables:', listError);
      // Continue with table creation attempt
    }

    // Table definition for classification feedback
    const tableParams = {
      TableName: FEEDBACK_TABLE,
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

    console.log(`Creating DynamoDB table: ${FEEDBACK_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error('Error setting up DynamoDB table:', error);
    process.exit(1);
  }
}

// Setup config table for application settings
async function setupConfigTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(CONFIG_TABLE);
    
    if (tableExists) {
      console.log(`Table '${CONFIG_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: CONFIG_TABLE,
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
    
    console.log(`Creating DynamoDB table: ${CONFIG_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${CONFIG_TABLE} table:`, error);
  }
}

// Setup document types table
async function setupDocTypeTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(DOC_TYPE_TABLE);
    
    if (tableExists) {
      console.log(`Table '${DOC_TYPE_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: DOC_TYPE_TABLE,
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
    
    console.log(`Creating DynamoDB table: ${DOC_TYPE_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${DOC_TYPE_TABLE} table:`, error);
  }
}

// Setup sub-types table
async function setupSubTypeTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(SUB_TYPE_TABLE);
    
    if (tableExists) {
      console.log(`Table '${SUB_TYPE_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: SUB_TYPE_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'documentTypeId', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'documentTypeId-index',
          KeySchema: [
            { AttributeName: 'documentTypeId', KeyType: 'HASH' }
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
    
    console.log(`Creating DynamoDB table: ${SUB_TYPE_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${SUB_TYPE_TABLE} table:`, error);
  }
}

// Setup data elements table
async function setupDataElementTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(DATA_ELEMENT_TABLE);
    
    if (tableExists) {
      console.log(`Table '${DATA_ELEMENT_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: DATA_ELEMENT_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'documentTypeId', AttributeType: 'S' },
        { AttributeName: 'subTypeId', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'documentTypeId-index',
          KeySchema: [
            { AttributeName: 'documentTypeId', KeyType: 'HASH' }
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
          IndexName: 'subTypeId-index',
          KeySchema: [
            { AttributeName: 'subTypeId', KeyType: 'HASH' }
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
    
    console.log(`Creating DynamoDB table: ${DATA_ELEMENT_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${DATA_ELEMENT_TABLE} table:`, error);
  }
}

// Setup training datasets table
async function setupTrainingDatasetTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(TRAINING_DATASET_TABLE);
    
    if (tableExists) {
      console.log(`Table '${TRAINING_DATASET_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: TRAINING_DATASET_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'documentTypeId', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'documentTypeId-index',
          KeySchema: [
            { AttributeName: 'documentTypeId', KeyType: 'HASH' }
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
    
    console.log(`Creating DynamoDB table: ${TRAINING_DATASET_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${TRAINING_DATASET_TABLE} table:`, error);
  }
}

// Setup training examples table
async function setupTrainingExampleTable() {
  try {
    // Check if table exists
    const listTablesResponse = await dynamoClient.send(new ListTablesCommand({}));
    const tableExists = listTablesResponse.TableNames.includes(TRAINING_EXAMPLE_TABLE);
    
    if (tableExists) {
      console.log(`Table '${TRAINING_EXAMPLE_TABLE}' already exists.`);
      return;
    }
    
    const tableParams = {
      TableName: TRAINING_EXAMPLE_TABLE,
      KeySchema: [
        { AttributeName: 'id', KeyType: 'HASH' } // Partition key
      ],
      AttributeDefinitions: [
        { AttributeName: 'id', AttributeType: 'S' },
        { AttributeName: 'documentTypeId', AttributeType: 'S' },
        { AttributeName: 'datasetId', AttributeType: 'S' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'documentTypeId-index',
          KeySchema: [
            { AttributeName: 'documentTypeId', KeyType: 'HASH' }
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
          IndexName: 'datasetId-index',
          KeySchema: [
            { AttributeName: 'datasetId', KeyType: 'HASH' }
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
    
    console.log(`Creating DynamoDB table: ${TRAINING_EXAMPLE_TABLE}...`);
    const createTableResponse = await dynamoClient.send(new CreateTableCommand(tableParams));
    console.log('Table created successfully:', createTableResponse.TableDescription.TableName);
  } catch (error) {
    console.error(`Error setting up ${TRAINING_EXAMPLE_TABLE} table:`, error);
  }
}

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

// Run the setup
async function setupAllTables() {
  try {
    await setupFeedbackTable();
    await setupConfigTable();
    await setupDocTypeTable();
    await setupSubTypeTable();
    await setupDataElementTable();
    await setupTrainingDatasetTable();
    await setupTrainingExampleTable();
    await setupPromptCategoriesTable();
    await setupPromptsTable();
    await setupRetentionPoliciesTable();
    console.log('All DynamoDB tables created successfully');
  } catch (error) {
    console.error('Error setting up DynamoDB tables:', error);
    process.exit(1);
  }
}

// Execute all setups
setupAllTables()
  .then(() => {
    console.log('DynamoDB setup completed successfully');
  })
  .catch(error => {
    console.error('Error in DynamoDB setup:', error);
    process.exit(1);
  }); 