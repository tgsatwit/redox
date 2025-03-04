import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';

// Check for required environment variables
const AWS_ACCESS_KEY_ID = process.env.APP_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.APP_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.APP_REGION || 'us-east-1';
// Check for both possible bucket name variables
const AWS_S3_BUCKET = process.env.APP_S3_BUCKET;

// Validate required environment variables
const missingEnvVars: string[] = [];
if (!AWS_ACCESS_KEY_ID) missingEnvVars.push('APP_ACCESS_KEY_ID');
if (!AWS_SECRET_ACCESS_KEY) missingEnvVars.push('APP_SECRET_ACCESS_KEY');
if (!AWS_S3_BUCKET) missingEnvVars.push('APP_S3_BUCKET');

// Initialize AWS SDK clients only if we have the required credentials
let s3Client: S3Client | null = null;
let textractClient: TextractClient | null = null;

if (missingEnvVars.length === 0) {
  // Initialize AWS SDK clients
  const clientConfig = {
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!
    }
  };

  s3Client = new S3Client(clientConfig);
  textractClient = new TextractClient(clientConfig);
}

/**
 * Process a single PDF page with AWS Textract
 * @param formData The form data containing the page image
 * @returns Textract results with text and geometry
 */
export async function POST(request: NextRequest) {
  try {
    // Check if we have the required environment variables
    if (missingEnvVars.length > 0) {
      console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
      return NextResponse.json(
        { 
          error: `Missing required AWS configuration: ${missingEnvVars.join(', ')}. Please set these environment variables.` 
        },
        { status: 500 }
      );
    }

    // Ensure AWS services are initialized
    if (!s3Client || !textractClient) {
      return NextResponse.json(
        { error: 'AWS services not properly initialized' },
        { status: 500 }
      );
    }

    // Parse the incoming form data
    const formData = await request.formData();
    const pageFile = formData.get('file') as File;
    const pageIndex = formData.get('pageIndex') as string;
    const documentType = formData.get('documentType') as string;
    
    if (!pageFile) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    // Get the content type of the uploaded file
    const contentType = pageFile.type;
    
    // Check if the file is an image (it should be since we converted PDF pages to images)
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are supported for page processing. Received: ' + contentType },
        { status: 400 }
      );
    }
    
    console.log(`Processing page image file: ${pageFile.name}, type: ${contentType}, size: ${pageFile.size} bytes`);
    
    // Create a temporary file path
    const tempFilePath = join(
      os.tmpdir(),
      `${Date.now()}-${pageFile.name}`
    );
    
    // Get the file bytes
    const bytes = await pageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Write the file to the temporary location
    await writeFile(tempFilePath, buffer);
    console.log(`File saved to ${tempFilePath}`);
    
    try {
      // Upload to S3 for Textract processing
      const uploadKey = `uploads/${Date.now()}-${pageFile.name}`;
      console.log(`Attempting to upload to S3 bucket: ${AWS_S3_BUCKET}`);
      
      await s3Client.send(new PutObjectCommand({
        Bucket: AWS_S3_BUCKET!,
        Key: uploadKey,
        Body: buffer,
        ContentType: contentType
      }));
      console.log(`Uploaded file to S3: ${uploadKey} with content type: ${contentType}`);
      
      // Verify the upload worked
      const headResult = await s3Client.send(new HeadObjectCommand({
        Bucket: AWS_S3_BUCKET!,
        Key: uploadKey
      }));
      console.log('S3 head object result:', headResult);
      
      // Use Textract to detect text in the image
      // For images, we use detectDocumentText which is synchronous
      const detectParams = {
        Document: {
          S3Object: {
            Bucket: AWS_S3_BUCKET!,
            Name: uploadKey
          }
        }
      };
      
      console.log('Calling textract.detectDocumentText with image page...');
      
      const textractResponse = await textractClient.send(
        new DetectDocumentTextCommand(detectParams)
      );
      
      // Process the textract response to extract text and bounding boxes
      const blocks = textractResponse.Blocks || [];
      
      // Define the type for Textract blocks
      interface TextractBlock {
        BlockType?: string;
        Text?: string;
        Id?: string;
        Geometry?: {
          BoundingBox?: {
            Width?: number;
            Height?: number;
            Left?: number;
            Top?: number;
          };
        };
        Confidence?: number;
      }
      
      // Extract text content
      const textBlocks = blocks.filter((block: TextractBlock) => 
        block.BlockType === 'LINE' || block.BlockType === 'WORD'
      );
      const extractedText = textBlocks
        .map((block: TextractBlock) => block.Text)
        .filter(Boolean)
        .join(' ');
      
      // Extract field information for potential redaction
      const extractedFields = [];
      const pageNumber = parseInt(pageIndex) + 1;
      
      for (const block of blocks as TextractBlock[]) {
        if (block.BlockType === 'LINE' && block.Text && block.Geometry?.BoundingBox) {
          extractedFields.push({
            id: `page-${pageNumber}-${block.Id}`,
            text: block.Text,
            boundingBox: block.Geometry.BoundingBox,
            confidence: block.Confidence || 0,
            pageIndex: parseInt(pageIndex) || 0
          });
        }
      }
      
      // Return the results
      return NextResponse.json({
        pageIndex: parseInt(pageIndex) || 0,
        extractedText,
        extractedFields,
        documentType,
        success: true
      });
    } catch (awsError) {
      console.error('AWS Error:', awsError);
      return NextResponse.json(
        { 
          error: `AWS Service Error: ${awsError instanceof Error ? awsError.message : 'Unknown AWS error'}`,
          code: awsError instanceof Error && 'code' in awsError ? (awsError as any).code : 'UNKNOWN'
        },
        { status: 500 }
      );
    } finally {
      // Clean up temporary file
      try {
        await unlink(tempFilePath);
        console.log(`Cleaned up temp file: ${tempFilePath}`);
      } catch (error) {
        console.warn(`Warning: Failed to clean up temp file: ${tempFilePath}`, error);
      }
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 