import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import {
  TextractClient,
  AnalyzeIDCommand
} from "@aws-sdk/client-textract"
import { createId } from "@paralleldrive/cuid2"

const s3Client = new S3Client({
  region: process.env.APP_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
  }
})

const textractClient = new TextractClient({
  region: process.env.APP_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.APP_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.APP_SECRET_ACCESS_KEY || ''
  }
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const subType = formData.get("subType") as string || "generic"
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Check file type
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf"
    ]
    
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a JPEG, PNG, or PDF file.` },
        { status: 400 }
      )
    }

    // Get file buffer
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)
    
    // Upload to S3
    const uniqueId = createId()
    const key = `uploads/${uniqueId}-${file.name}`
    
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET,
        Key: key,
        Body: fileBytes,
        ContentType: file.type,
      })
    )
    
    // Process ID document with AWS Textract AnalyzeID
    const textractResponse = await textractClient.send(
      new AnalyzeIDCommand({
        DocumentPages: [
          {
            S3Object: {
              Bucket: process.env.APP_S3_BUCKET,
              Name: key,
            },
          },
        ],
      })
    )
    
    // Convert Textract AnalyzeID response to our format
    const identityDocuments = textractResponse.IdentityDocuments || []
    
    // Format for our application
    if (identityDocuments.length === 0) {
      return NextResponse.json(
        { error: "No identity documents detected in the image" },
        { status: 400 }
      )
    }
    
    // Get the first document (we only process one file at a time in this API)
    const document = identityDocuments[0]
    const documentFields = document.IdentityDocumentFields || []
    
    // Extract fields from document
    const extractedFields = documentFields.map((field, index) => {
      const type = field.Type
      const valueDetection = field.ValueDetection
      
      // Skip fields without value detection
      if (!valueDetection) return null
      
      // Create our field format
      return {
        id: `field-${index}`,
        label: type?.Text || `Field ${index + 1}`,
        value: valueDetection.Text || "",
        confidence: valueDetection.Confidence || 0,
        dataType: inferDataTypeForIdField(type?.Text || ""),
        boundingBox: null,
        normalized: valueDetection.NormalizedValue?.Value || null
      }
    }).filter(field => field !== null)
    
    // Calculate overall confidence
    const documentConfidence = documentFields.reduce((sum, field) => {
      return sum + (field.ValueDetection?.Confidence || 0)
    }, 0) / (documentFields.length || 1)
    
    // Return processed data
    return NextResponse.json({
      documentType: "ID Document",
      subType: determineIdSubType(extractedFields),
      confidence: documentConfidence,
      extractedFields,
      rawResponse: process.env.NODE_ENV === 'development' ? textractResponse : undefined
    })
  } catch (error) {
    console.error("Error processing ID document:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error occurred" },
      { status: 500 }
    )
  }
}

// Helper function to infer data type based on field type
function inferDataTypeForIdField(fieldType: string): string {
  const fieldTypeLower = fieldType.toLowerCase()
  
  if (fieldTypeLower.includes('date')) return 'Date'
  if (fieldTypeLower.includes('number') || fieldTypeLower.includes('id')) return 'Text'
  if (fieldTypeLower.includes('name')) return 'Name'
  if (fieldTypeLower.includes('address')) return 'Address'
  if (fieldTypeLower.includes('birth')) return 'Date'
  if (fieldTypeLower.includes('expiration') || fieldTypeLower.includes('expiry')) return 'Date'
  
  return 'Text'
}

// Determine ID document sub-type based on extracted fields
function determineIdSubType(fields: any[]): string {
  // Check for passport-specific fields
  const hasPassportFields = fields.some(field => {
    const label = field.label.toLowerCase()
    return label.includes('passport') || 
           label.includes('nationality') || 
           label.includes('issuing country')
  })
  
  if (hasPassportFields) return 'Passport'
  
  // Check for driver's license fields
  const hasDriversLicenseFields = fields.some(field => {
    const label = field.label.toLowerCase()
    return label.includes('license') || 
           label.includes('class') || 
           label.includes('endorsements') || 
           label.includes('restrictions')
  })
  
  if (hasDriversLicenseFields) return 'Driver\'s License'
  
  // Default
  return 'Generic ID'
} 