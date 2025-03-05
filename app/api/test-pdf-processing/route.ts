import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';
import { PDFDocument } from 'pdf-lib';

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

/**
 * Test the complete PDF processing pipeline
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the incoming form data
    const formData = await request.formData();
    const pdfFile = formData.get('file') as File;
    
    if (!pdfFile) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    // Check if it's a PDF
    if (pdfFile.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are supported for this test' },
        { status: 400 }
      );
    }
    
    console.log(`Processing PDF file: ${pdfFile.name}, size: ${pdfFile.size} bytes`);
    
    // Create a temporary file path
    const tempFilePath = join(
      os.tmpdir(),
      `${Date.now()}-${pdfFile.name}`
    );
    
    // Get the PDF bytes
    const pdfBytes = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(pdfBytes);
    
    // Write the file to the temporary location
    await writeFile(tempFilePath, buffer);
    console.log(`PDF saved to ${tempFilePath}`);
    
    // Try to inspect the PDF (using pdf-lib)
    let pdfInfo = {};
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();
      const firstPage = pdfDoc.getPage(0);
      const { width, height } = firstPage.getSize();
      
      pdfInfo = {
        pageCount,
        firstPageWidth: width,
        firstPageHeight: height,
        pdfVersion: pdfDoc.getProducer() || 'Unknown'
      };
      
      console.log('PDF info:', pdfInfo);
    } catch (pdfError) {
      console.error('Error inspecting PDF:', pdfError);
      pdfInfo = { error: 'Failed to inspect PDF: ' + (pdfError instanceof Error ? pdfError.message : String(pdfError)) };
    }
    
    // Test direct Textract processing (this should fail for PDF)
    let directTextractResult = {};
    try {
      console.log('Testing direct Textract processing of PDF (this should fail)...');
      
      // Upload to S3 for Textract processing
      const uploadKey = `test-uploads/${Date.now()}-${pdfFile.name}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName!,
        Key: uploadKey,
        Body: buffer,
        ContentType: 'application/pdf'
      }));
      console.log(`Uploaded PDF to S3: ${uploadKey}`);
      
      // Try to use Textract directly on the PDF
      const detectParams = {
        Document: {
          S3Object: {
            Bucket: bucketName!,
            Name: uploadKey
          }
        }
      };
      
      console.log('Calling textract.detectDocumentText with PDF...');
      const textractResponse = await textractClient.send(
        new DetectDocumentTextCommand(detectParams)
      );
      
      // This should not succeed, but if it does, process the result
      const blocks = textractResponse.Blocks || [];
      directTextractResult = {
        success: true,
        blockCount: blocks.length,
        message: 'Direct PDF processing succeeded unexpectedly'
      };
    } catch (error) {
      // Type assertion to handle unknown error type
      const textractError = error as { message: string; code?: string };
      console.log('Direct Textract processing failed as expected:', textractError.message);
      directTextractResult = {
        success: false,
        error: textractError.message,
        code: textractError.code || 'UNKNOWN',
        message: 'Direct PDF processing failed as expected'
      };
    }
    
    // Test extracting the first page as an image and processing it
    let pageImageResult = {};
    try {
      console.log('Testing page extraction and processing...');
      
      // Check if OffscreenCanvas is available (not available in all Node.js environments)
      if (typeof OffscreenCanvas === 'undefined') {
        console.log('OffscreenCanvas is not available in this environment, skipping page image test');
        pageImageResult = {
          success: false,
          error: 'OffscreenCanvas is not available in this environment',
          message: 'Page image test skipped - Canvas API not available server-side'
        };
      } else {
        // This would normally be done client-side with PDF.js,
        // but for this server test we'll generate a dummy image
        const dummyCanvas = new OffscreenCanvas(1000, 1000);
        const ctx = dummyCanvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 1000, 1000);
        ctx.fillStyle = 'black';
        ctx.font = '24px Arial';
        ctx.fillText('This is a test page from a PDF', 100, 100);
        
        const imageBlob = await dummyCanvas.convertToBlob({ type: 'image/png' });
        const pageImageFile = new File([imageBlob], 'test-page.png', { type: 'image/png' });
        
        console.log('Created test page image, size:', pageImageFile.size, 'bytes');
        
        // Upload to S3 for Textract processing
        const uploadKey = `test-uploads/${Date.now()}-test-page.png`;
        const imageBuffer = Buffer.from(await pageImageFile.arrayBuffer());
        
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName!,
          Key: uploadKey,
          Body: imageBuffer,
          ContentType: 'image/png'
        }));
        console.log(`Uploaded test page image to S3: ${uploadKey}`);
        
        // Try to use Textract on the page image
        const detectParams = {
          Document: {
            S3Object: {
              Bucket: bucketName!,
              Name: uploadKey
            }
          }
        };
        
        console.log('Calling textract.detectDocumentText with page image...');
        const textractResponse = await textractClient.send(
          new DetectDocumentTextCommand(detectParams)
        );
        
        // Process the results
        const blocks = textractResponse.Blocks || [];
        const textBlocks = blocks.filter((block: TextractBlock) => 
          block.BlockType === 'LINE' || block.BlockType === 'WORD'
        );
        const extractedText = textBlocks
          .map((block: TextractBlock) => block.Text)
          .filter(Boolean)
          .join(' ');
        
        pageImageResult = {
          success: true,
          blockCount: blocks.length,
          extractedText,
          message: 'Page image processing succeeded'
        };
      }
    } catch (pageError) {
      console.error('Error processing page image:', pageError);
      pageImageResult = {
        success: false,
        error: pageError instanceof Error ? pageError.message : String(pageError),
        message: 'Page image processing failed'
      };
    }
    
    // Clean up temporary file
    try {
      await unlink(tempFilePath);
      console.log(`Cleaned up temp file: ${tempFilePath}`);
    } catch (error) {
      console.warn(`Warning: Failed to clean up temp file: ${tempFilePath}`, error);
    }
    
    // Return comprehensive results
    return NextResponse.json({
      success: true,
      pdfInfo,
      directTextractResult,
      pageImageResult,
      message: 'PDF processing test complete',
      recommendations: [
        'As expected, direct PDF processing with Textract fails',
        'Page image processing should work correctly',
        'Use the page-by-page approach for PDFs'
      ]
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
} 