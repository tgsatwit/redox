// Script to add the missing subTypeId index to document-processor-elements table
const { DynamoDBClient, UpdateTableCommand } = require('@aws-sdk/client-dynamodb');

// Configure AWS
const getDynamoDBConfig = () => {
  // Use local configuration with AWS profile if necessary
  const config = {
    region: process.env.APP_REGION || 'ap-southeast-2',
  };

  // For local development or endpoints
  if (process.env.DYNAMODB_ENDPOINT) {
    config.endpoint = process.env.DYNAMODB_ENDPOINT;
  }

  return config;
};

const DATA_ELEMENT_TABLE = 'document-processor-elements';

async function addSubTypeIndex() {
  try {
    console.log('Adding subTypeId-index to document-processor-elements table...');
    const client = new DynamoDBClient(getDynamoDBConfig());

    const updateTableCommand = new UpdateTableCommand({
      TableName: DATA_ELEMENT_TABLE,
      AttributeDefinitions: [
        // We need to include all existing attribute definitions
        {
          AttributeName: 'id',
          AttributeType: 'S'
        },
        {
          AttributeName: 'documentTypeId',
          AttributeType: 'S'
        },
        // Add the new attribute definition
        {
          AttributeName: 'subTypeId',
          AttributeType: 'S'
        }
      ],
      // Add the new GSI
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: 'subTypeId-index',
            KeySchema: [
              {
                AttributeName: 'subTypeId',
                KeyType: 'HASH'
              }
            ],
            Projection: {
              ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5
            }
          }
        }
      ]
    });

    const result = await client.send(updateTableCommand);
    console.log('Table update initiated. It may take a few minutes to complete.');
    console.log('Index status:', result.TableDescription.GlobalSecondaryIndexes.find(
      gsi => gsi.IndexName === 'subTypeId-index'
    )?.IndexStatus || 'Unknown');
    
    return result;
  } catch (error) {
    console.error('Error adding subTypeId-index:', error);
    throw error;
  }
}

// Execute the function
addSubTypeIndex()
  .then(() => console.log('Process completed'))
  .catch(err => {
    console.error('Process failed:', err);
    process.exit(1);
  }); 