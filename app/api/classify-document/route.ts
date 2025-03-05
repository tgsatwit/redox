import { NextResponse } from 'next/server';
import { 
  ComprehendClient, 
  DetectDominantLanguageCommand, 
  DetectEntitiesCommand,
  DetectSentimentCommand,
  DetectDominantLanguageCommandOutput,
  DetectEntitiesCommandOutput,
  DetectSentimentCommandOutput,
  LanguageCode
} from "@aws-sdk/client-comprehend";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from 'crypto';

// Interface for classification results
interface ClassificationResult {
  name: string;
  score: number;
}

// Helper function to convert any language code to a valid AWS Comprehend language code
function toValidLanguageCode(code: string): LanguageCode {
  const defaultCode = LanguageCode.EN;
  
  // Map of supported language codes
  const validCodes: Record<string, LanguageCode> = {
    'en': LanguageCode.EN,
    'es': LanguageCode.ES,
    'fr': LanguageCode.FR,
    'de': LanguageCode.DE,
    'it': LanguageCode.IT,
    'pt': LanguageCode.PT,
    'ar': LanguageCode.AR,
    'hi': LanguageCode.HI,
    'ja': LanguageCode.JA,
    'ko': LanguageCode.KO,
    'zh': LanguageCode.ZH,
    'zh-TW': LanguageCode.ZH_TW
  };
  
  return validCodes[code] || defaultCode;
}

// Get AWS credentials from environment
const getAwsCredentials = () => {
  const requiredEnvVars = [
    'APP_REGION', 
    'APP_ACCESS_KEY_ID', 
    'APP_SECRET_ACCESS_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required AWS configuration: ${missingVars.join(', ')}`);
  }
  
  return {
    region: process.env.APP_REGION!,
    credentials: {
      accessKeyId: process.env.APP_ACCESS_KEY_ID!,
      secretAccessKey: process.env.APP_SECRET_ACCESS_KEY!,
    }
  };
};

// Helper to truncate text to a safe size for AWS Comprehend
const truncateForComprehend = (text: string, maxBytes = 4800): string => {
  // Safety margin below 5000 byte limit
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  
  if (bytes.length <= maxBytes) {
    return text;
  }
  
  // Binary search to find the maximum text length that fits within maxBytes
  let low = 0;
  let high = text.length;
  
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    const slice = text.substring(0, mid);
    const sliceBytes = encoder.encode(slice).length;
    
    if (sliceBytes <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  
  return text.substring(0, low);
};

export async function POST(request: Request) {
  try {
    // Parse the form
    const formData = await request.formData();
    const uploadedFile = formData.get('file') as File;
    
    if (!uploadedFile) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Validate file type (we only support PDFs and images)
    const fileType = uploadedFile.type || '';
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    
    if (!supportedTypes.includes(fileType)) {
      return NextResponse.json({ 
        error: `Unsupported file type: ${fileType}. Please upload a PDF or image.` 
      }, { status: 400 });
    }

    let s3Key: string | null = null;
    let bucketName: string | null = null;
    
    try {
      // Set up AWS clients
      const awsConfig = getAwsCredentials();
      const s3Client = new S3Client(awsConfig);
      const comprehendClient = new ComprehendClient(awsConfig);

      // Read file content
      const fileBuffer = await uploadedFile.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      
      // Convert file to text for Comprehend
      const fileText = new TextDecoder().decode(fileBytes);
      
      // Generate a unique file name for S3
      const fileHash = crypto.createHash('md5').update(Buffer.from(fileBytes)).digest('hex');
      s3Key = `temp-docs/${fileHash}-${uploadedFile.name}`;
      // Handle possibly undefined environment variables
      const envBucketName = process.env.APP_S3_BUCKET || null;
      bucketName = envBucketName;
      
      if (!bucketName) {
        throw new Error('APP_S3_BUCKET environment variable is not set');
      }

      // Upload file to S3
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: fileBytes,
          ContentType: fileType,
        }));
      } catch (s3Error: any) {
        if (s3Error?.$metadata?.httpStatusCode === 403) {
          throw new Error(`AWS S3 permissions error: Your IAM user needs 's3:PutObject' permission for bucket ${bucketName}.`);
        }
        throw s3Error;
      }

      // Detect document language - use first 5000 bytes max
      let detectLanguageResponse: DetectDominantLanguageCommandOutput;
      try {
        const languageSample = truncateForComprehend(fileText, 4800);
        detectLanguageResponse = await comprehendClient.send(
          new DetectDominantLanguageCommand({
            Text: languageSample
          })
        );
      } catch (langError: any) {
        if (langError?.$metadata?.httpStatusCode === 403 || 
            (langError?.__type === 'AccessDeniedException' || langError.message?.includes('not authorized'))) {
          throw new Error(`AWS Comprehend permissions error: Your IAM user needs 'comprehend:DetectDominantLanguage' permission. ${langError.message}`);
        }
        throw langError;
      }
      
      const detectedLangCode: string = detectLanguageResponse.Languages?.[0]?.LanguageCode || 'en';
      const languageCode = toValidLanguageCode(detectedLangCode);

      // Detect entities in the document - use first 5000 bytes max
      let entitiesResponse: DetectEntitiesCommandOutput;
      try {
        const entitySample = truncateForComprehend(fileText, 4800);
        entitiesResponse = await comprehendClient.send(
          new DetectEntitiesCommand({
            Text: entitySample,
            LanguageCode: languageCode
          })
        );
      } catch (entityError: any) {
        if (entityError?.$metadata?.httpStatusCode === 403 || 
            (entityError?.__type === 'AccessDeniedException' || entityError.message?.includes('not authorized'))) {
          throw new Error(`AWS Comprehend permissions error: Your IAM user needs 'comprehend:DetectEntities' permission. ${entityError.message}`);
        }
        throw entityError;
      }

      // Get sentiment of the document - use first 5000 bytes max 
      let sentimentResponse: DetectSentimentCommandOutput;
      try {
        const sentimentSample = truncateForComprehend(fileText, 4800);
        sentimentResponse = await comprehendClient.send(
          new DetectSentimentCommand({
            Text: sentimentSample,
            LanguageCode: languageCode
          })
        );
      } catch (sentimentError: any) {
        console.warn("Sentiment analysis failed:", sentimentError);
        
        // Provide default sentiment values
        sentimentResponse = { 
          Sentiment: "NEUTRAL" as const, 
          SentimentScore: {
            Positive: 0,
            Negative: 0,
            Neutral: 1,
            Mixed: 0
          }, 
          $metadata: {} 
        } as DetectSentimentCommandOutput;
      }

      // Group entities by type
      const entityCounts: Record<string, number> = {};
      const entityScores: Record<string, number> = {};
      
      entitiesResponse.Entities?.forEach(entity => {
        const type = entity.Type || 'UNKNOWN';
        entityCounts[type] = (entityCounts[type] || 0) + 1;
        entityScores[type] = (entityScores[type] || 0) + (entity.Score || 0);
      });
      
      // Calculate average score for each entity type
      Object.keys(entityScores).forEach(type => {
        if (entityCounts[type] > 0) {
          entityScores[type] = entityScores[type] / entityCounts[type];
        }
      });
      
      // Convert to sorted array
      const entityTypes = Object.keys(entityCounts).map(type => ({
        name: type,
        count: entityCounts[type],
        score: entityScores[type]
      })).sort((a, b) => b.count - a.count);
      
      // Determine dominant document type
      const dominant = entityTypes.length > 0 ? entityTypes[0].name : 'UNKNOWN';

      // Create classification results
      const classes: ClassificationResult[] = entityTypes.map(entity => ({
        name: entity.name,
        score: entity.score
      }));

      // Send the response
      return NextResponse.json({
        success: true,
        dominant,
        classes,
        sentiment: sentimentResponse.Sentiment,
        sentimentScores: sentimentResponse.SentimentScore,
        languageCode: detectedLangCode || 'en',
      });
    } catch (awsError: any) {
      // Handle AWS-specific errors with helpful messages
      if (awsError.message?.includes('AWS Comprehend permissions error') ||
          awsError.message?.includes('AWS S3 permissions error')) {
        return NextResponse.json({
          error: awsError.message,
          permissionsIssue: true
        }, { status: 403 });
      }
      
      throw awsError;
    } finally {
      // Clean up S3 file if we created one
      if (s3Key && bucketName) {
        try {
          const s3Client = new S3Client(getAwsCredentials());
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
          }));
        } catch (cleanupError: any) {
          // Just log cleanup errors, don't fail the request
          console.warn("Error cleaning up S3 file:", cleanupError);
          // Could be permission issue, but we can continue as this is just cleanup
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing document:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error during document analysis',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 