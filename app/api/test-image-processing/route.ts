import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';

// Setup AWS SDK clients
const region = process.env.APP_REGION || 'us-east-1';
const clientConfig = {
  region,
  credentials: {
    accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
  }
};

const s3Client = new S3Client(clientConfig);
const textractClient = new TextractClient(clientConfig);

// Get the S3 bucket name from environment variables
const bucketName = process.env.APP_S3_BUCKET;

// Validate required environment variables
if (!bucketName) {
  console.error('Missing required environment variable: APP_S3_BUCKET');
}

/**
 * Test endpoint to verify Textract image processing works
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming form data
    const formData = await request.formData();
    const imageFile = formData.get('file') as File;
    
    if (!imageFile) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    // Get the content type of the uploaded file
    const contentType = imageFile.type;
    
    // Check if the file is an image
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are supported for this test endpoint' },
        { status: 400 }
      );
    }
    
    console.log(`Processing image file: ${imageFile.name}, type: ${contentType}, size: ${imageFile.size} bytes`);
    
    // Create a temporary file path
    const tempFilePath = join(
      os.tmpdir(),
      `${Date.now()}-${imageFile.name}`
    );
    
    // Get the file bytes
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Write the file to the temporary location
    await writeFile(tempFilePath, buffer);
    console.log(`File saved to ${tempFilePath}`);
    
    // Upload to S3 for Textract processing
    const uploadKey = `test-uploads/${Date.now()}-${imageFile.name}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName!,
      Key: uploadKey,
      Body: buffer,
      ContentType: contentType
    }));
    console.log(`Uploaded file to S3: ${uploadKey}`);
    
    // Use Textract to detect text in the image
    const detectParams = {
      Document: {
        S3Object: {
          Bucket: bucketName!,
          Name: uploadKey
        }
      }
    };
    
    console.log('Calling textract.detectDocumentText with image...');
    const textractResponse = await textractClient.send(
      new DetectDocumentTextCommand(detectParams)
    );
    
    // Process the textract response
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
    
    // Clean up temporary file
    try {
      await unlink(tempFilePath);
      console.log(`Cleaned up temp file: ${tempFilePath}`);
    } catch (error) {
      console.warn(`Warning: Failed to clean up temp file: ${tempFilePath}`, error);
    }
    
    // Return the results
    return NextResponse.json({
      success: true,
      extractedText,
      blockCount: blocks.length,
      message: 'Image processing successful!'
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 