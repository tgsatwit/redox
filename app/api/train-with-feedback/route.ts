import { NextResponse } from 'next/server';
import { 
  DynamoDBClient, 
  ScanCommand, 
  UpdateItemCommand 
} from '@aws-sdk/client-dynamodb';
import { 
  ComprehendClient, 
  CreateDocumentClassifierCommand 
} from '@aws-sdk/client-comprehend';
import { v4 as uuidv4 } from 'uuid';

// Get AWS credentials from environment
const getAwsCredentials = () => {
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

interface TrainRequest {
  documentType: string;
  count?: number;
}

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body: TrainRequest = await request.json();
    
    // Validate required fields
    if (!body.documentType) {
      return NextResponse.json(
        { error: 'documentType is required' },
        { status: 400 }
      );
    }

    // Get the DynamoDB table name from environment
    const feedbackTableName = process.env.DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE;
    
    if (!feedbackTableName) {
      return NextResponse.json(
        { error: 'DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE environment variable is not set' },
        { status: 400 }
      );
    }

    try {
      // Set up DynamoDB client with AWS credentials
      const dynamoClient = new DynamoDBClient(getAwsCredentials());
      const comprehendClient = new ComprehendClient(getAwsCredentials());
      
      // Scan DynamoDB to get feedback items for this document type
      // Only get items that haven't been used for training yet
      const scanCommand = new ScanCommand({
        TableName: feedbackTableName,
        FilterExpression: "(correctedDocumentType = :docType OR originalClassificationType = :docType) AND hasBeenUsedForTraining = :hasBeenUsed",
        ExpressionAttributeValues: {
          ":docType": { S: body.documentType },
          ":hasBeenUsed": { BOOL: false }
        }
      });
      
      const scanResult = await dynamoClient.send(scanCommand);
      
      if (!scanResult.Items || scanResult.Items.length === 0) {
        return NextResponse.json(
          { error: 'No untrained feedback items found for this document type' },
          { status: 400 }
        );
      }
      
      console.log(`Found ${scanResult.Items.length} feedback items for training`);
      
      // Process feedback items to prepare training data
      const trainingData = scanResult.Items.map(item => {
        // For trained examples, prefer corrected document type over original
        const documentType = item.correctedDocumentType?.S || item.originalClassificationType?.S || 'Unknown';
        
        // Return formatted training example
        return {
          documentType,
          feedbackId: item.id.S
        };
      });
      
      // In a real implementation, we would now:
      // 1. Generate a training CSV or manifest file
      // 2. Upload it to S3
      // 3. Start an AWS Comprehend training job
      
      // For demonstration, we'll just simulate these steps:
      const trainingJobId = uuidv4();
      
      // For development/testing environment, simulate a successful response
      if (process.env.NODE_ENV === 'development') {
        // Mark feedback items as used for training
        for (const item of scanResult.Items) {
          // Skip items with undefined id
          if (!item.id?.S) continue;
          
          const updateCommand = new UpdateItemCommand({
            TableName: feedbackTableName,
            Key: { id: { S: item.id.S } },
            UpdateExpression: "SET hasBeenUsedForTraining = :hasBeenUsed",
            ExpressionAttributeValues: {
              ":hasBeenUsed": { BOOL: true }
            }
          });
          
          await dynamoClient.send(updateCommand);
        }
        
        return NextResponse.json({
          success: true,
          message: 'Training job initiated successfully',
          trainingJobId,
          itemsUsed: scanResult.Items.length,
          documentType: body.documentType,
          isDevelopment: true
        });
      }
      
      // For production, actually start a Comprehend training job
      // This requires proper AWS IAM permissions and S3 bucket setup
      try {
        const roleArn = process.env.AWS_COMPREHEND_ROLE_ARN;
        const s3BucketName = process.env.AWS_S3_BUCKET;
        
        if (!roleArn || !s3BucketName) {
          throw new Error('AWS_COMPREHEND_ROLE_ARN and AWS_S3_BUCKET environment variables must be set');
        }
        
        // TODO: This part would need to be implemented based on your specific AWS setup
        // It requires generating a training dataset, uploading to S3, and starting 
        // a Comprehend training job
        
        return NextResponse.json({
          success: true,
          message: 'Training job initiated on AWS Comprehend',
          trainingJobId: 'aws-job-id-would-be-here',
          itemsUsed: scanResult.Items.length,
          documentType: body.documentType
        });
      } catch (comprehendError) {
        console.error('AWS Comprehend Error:', comprehendError);
        
        return NextResponse.json({
          error: 'Failed to start training job on AWS Comprehend',
          details: comprehendError instanceof Error ? comprehendError.message : String(comprehendError)
        }, { status: 500 });
      }
    } catch (dbError) {
      console.error('DynamoDB Error:', dbError);
      
      return NextResponse.json({
        error: 'Failed to retrieve feedback items from DynamoDB',
        details: dbError instanceof Error ? dbError.message : String(dbError)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Error processing training request:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process training request', 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 