import { NextResponse } from 'next/server';
import { 
  ComprehendClient, 
  CreateDocumentClassifierCommand,
  DocumentClassifierDocumentTypeFormat,
  DocumentClassifierMode
} from "@aws-sdk/client-comprehend";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  SFNClient,
  StartExecutionCommand
} from "@aws-sdk/client-sfn";
import { v4 as uuidv4 } from 'uuid';

// Function to get AWS credentials
const getAwsCredentials = () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';
  
  if (!accessKeyId || !secretAccessKey) {
    console.warn('AWS credentials not found in environment variables');
  }
  
  return {
    credentials: {
      accessKeyId: accessKeyId || 'missing',
      secretAccessKey: secretAccessKey || 'missing'
    },
    region
  };
};

// Define the request body interface
interface TrainingRequestBody {
  documentTypeId: string;
  datasetId: string;
  dataset: {
    name: string;
    examples: Array<{
      id: string;
      documentType: string;
      fileKey: string;
      isApproved: boolean;
    }>;
  };
}

export async function POST(request: Request) {
  try {
    // Parse the request body
    const body: TrainingRequestBody = await request.json();
    
    // Validate required fields
    if (!body.documentTypeId || !body.datasetId || !body.dataset) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Get approved examples
    const approvedExamples = body.dataset.examples.filter(ex => ex.isApproved);
    
    // Check if there are enough training examples
    if (approvedExamples.length < 5) {
      return NextResponse.json(
        { error: 'At least 5 approved examples are required for training' },
        { status: 400 }
      );
    }
    
    // Get the S3 bucket name from environment variables
    const s3Bucket = process.env.AWS_S3_BUCKET;
    const comprehendTrainingRoleArn = process.env.AWS_COMPREHEND_ROLE_ARN;
    const stepFunctionArn = process.env.AWS_STEP_FUNCTION_TRAINING_ARN;
    
    // Check if required environment variables are set
    if (!s3Bucket) {
      console.warn('S3 bucket not set in environment variables');
      
      // In development, return mock response
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json({
          success: true,
          message: 'Training initiated in development mode (mock)',
          modelId: `dev-model-${uuidv4().substring(0, 8)}`,
          trainingJobArn: `arn:aws:comprehend:us-east-1:123456789012:document-classifier/dev-model-${Date.now()}`
        });
      }
      
      return NextResponse.json(
        { error: 'S3 bucket not configured' },
        { status: 500 }
      );
    }
    
    if (!comprehendTrainingRoleArn && process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'AWS Comprehend role ARN not configured' },
        { status: 500 }
      );
    }
    
    // Set up AWS clients
    const s3Client = new S3Client(getAwsCredentials());
    const comprehendClient = new ComprehendClient(getAwsCredentials());
    const sfnClient = stepFunctionArn ? new SFNClient(getAwsCredentials()) : null;
    
    // Generate a unique ID for the training job
    const trainingId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const manifestKey = `training/${body.documentTypeId}/${trainingId}/manifest.json`;
    
    // Generate AWS Comprehend manifest file
    const manifestDocuments = approvedExamples.map(example => ({
      source: `s3://${s3Bucket}/${example.fileKey}`,
      class: example.documentType
    }));
    
    const manifestContent = JSON.stringify({
      documents: manifestDocuments
    }, null, 2);
    
    try {
      // Upload manifest file to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: s3Bucket,
        Key: manifestKey,
        Body: manifestContent,
        ContentType: 'application/json'
      }));
      
      // Prepare classifier name and other parameters
      const classifierName = `doc-classifier-${body.documentTypeId.substring(0, 8)}-${timestamp}`;
      
      if (process.env.NODE_ENV === 'development') {
        // In development, just return a success response
        return NextResponse.json({
          success: true,
          message: 'Training initiated in development mode (mocked)',
          modelId: classifierName,
          trainingJobArn: `arn:aws:comprehend:us-east-1:123456789012:document-classifier/${classifierName}`
        });
      }
      
      // In production, initiate the Comprehend training job
      const command = new CreateDocumentClassifierCommand({
        DocumentClassifierName: classifierName,
        DataAccessRoleArn: comprehendTrainingRoleArn,
        InputDataConfig: {
          DataFormat: 'COMPREHEND_CSV',
          S3Uri: `s3://${s3Bucket}/${manifestKey}`
        },
        LanguageCode: 'en',
        Mode: DocumentClassifierMode.MULTI_CLASS,
        VersionName: `v-${timestamp}`
      });
      
      const response = await comprehendClient.send(command);
      
      // If Step Function ARN is provided, start the monitoring workflow
      if (sfnClient && stepFunctionArn) {
        await sfnClient.send(new StartExecutionCommand({
          stateMachineArn: stepFunctionArn,
          input: JSON.stringify({
            documentTypeId: body.documentTypeId,
            datasetId: body.datasetId,
            classifierArn: response.DocumentClassifierArn,
            timestamp: Date.now()
          }),
          name: `train-${trainingId}`
        }));
      }
      
      return NextResponse.json({
        success: true,
        modelId: classifierName,
        trainingJobArn: response.DocumentClassifierArn
      });
      
    } catch (error: any) {
      console.error('Error during AWS operations:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to start training job',
          message: error.message 
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('Error processing request:', error);
    
    return NextResponse.json(
      { error: 'Failed to process training request', message: error.message },
      { status: 500 }
    );
  }
} 