import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { createId } from "@paralleldrive/cuid2"
import type { DocumentData, ExtractedField } from "@/lib/types"
import sharp from "sharp"
import { Buffer } from "buffer"

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
})

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const fieldsToRedactStr = formData.get("fieldsToRedact") as string || "[]"
    const documentDataStr = formData.get("documentData") as string || "{}"
    
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }
    
    // Parse the JSON strings
    let fieldsToRedact: string[] = []
    let documentData: DocumentData
    
    try {
      fieldsToRedact = JSON.parse(fieldsToRedactStr)
      documentData = JSON.parse(documentDataStr)
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid JSON data" },
        { status: 400 }
      )
    }
    
    // Check the parsed data
    if (!documentData || !Array.isArray(fieldsToRedact)) {
      return NextResponse.json(
        { error: "Invalid document data or fields to redact" },
        { status: 400 }
      )
    }
    
    // Get file buffer
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = Buffer.from(fileBuffer)
    
    // Get the fields to redact from the document data
    const fieldsToRedactData = documentData.extractedFields.filter(
      (field) => fieldsToRedact.includes(field.id)
    )
    
    // Handle PDF files differently
    if (file.type === "application/pdf") {
      // For PDFs, we'll just return the original file as a data URL
      // In a real implementation, you would use a PDF manipulation library
      // to perform the redaction on the server side
      
      // Generate a unique ID for the redacted file
      const redactedFileId = createId()
      const key = `redacted/${redactedFileId}.pdf`
      
      // Upload the PDF to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key,
          Body: fileBytes,
          ContentType: "application/pdf",
        })
      )
      
      // Create a pre-signed URL for the redacted PDF
      const publicUrl = `${process.env.NEXT_PUBLIC_S3_URL}/${key}`
      
      // Return the URL of the "redacted" PDF
      return NextResponse.json({
        redactedImageUrl: publicUrl,
        message: "PDF redaction is simulated. In a production environment, you would use a PDF manipulation library to perform actual redaction."
      })
    }
    
    // Process the image with Sharp for image files
    let sharpImage = sharp(fileBytes)
    const metadata = await sharpImage.metadata()
    
    const { width, height } = metadata
    
    if (!width || !height) {
      return NextResponse.json(
        { error: "Could not determine image dimensions" },
        { status: 400 }
      )
    }
    
    // Create SVG overlay with redaction boxes
    const svgRedactionBoxes = createRedactionSVG(fieldsToRedactData, width, height)
    
    // Composite the SVG overlay on top of the image
    const processedImage = await sharpImage
      .composite([
        {
          input: Buffer.from(svgRedactionBoxes),
          gravity: "northwest",
        },
      ])
      .png()
      .toBuffer()
    
    // Generate a unique ID for the redacted file
    const redactedFileId = createId()
    const key = `redacted/${redactedFileId}.png`
    
    // Upload the redacted image to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: processedImage,
        ContentType: "image/png",
      })
    )
    
    // Create a pre-signed URL for the redacted image
    const publicUrl = `${process.env.NEXT_PUBLIC_S3_URL}/${key}`
    
    // Return the URL of the redacted image
    return NextResponse.json({
      redactedImageUrl: publicUrl,
    })
  } catch (error) {
    console.error("Error redacting document:", error)
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    )
  }
}

// Create SVG with redaction boxes
function createRedactionSVG(fields: ExtractedField[], width: number, height: number): string {
  // Start SVG
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
  
  // Track elements without bounding boxes to position them in a grid
  let missingBoxCount = 0;
  
  // Add redaction boxes
  fields.forEach((field) => {
    // Handle elements with or without bounding boxes
    if (field.boundingBox) {
      // Handle both BoundingBox and AwsBoundingBox types
      let rectX: number, rectY: number, rectWidth: number, rectHeight: number;

      // Check if it's AwsBoundingBox or BoundingBox format
      if ('Left' in field.boundingBox) {
        // AWS format with Left, Top, Width, Height
        rectX = field.boundingBox.Left * width;
        rectY = field.boundingBox.Top * height;
        rectWidth = field.boundingBox.Width * width;
        rectHeight = field.boundingBox.Height * height;
      } else {
        // Standard format with x, y, width, height
        rectX = field.boundingBox.x * width;
        rectY = field.boundingBox.y * height;
        rectWidth = field.boundingBox.width * width;
        rectHeight = field.boundingBox.height * height;
      }
      
      // Add rectangle
      svg += `<rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" 
                fill="black" fill-opacity="1" />`
    } else {
      // For elements without bounding boxes, create default positions in a grid at the top
      // Calculate position based on count to create a grid
      const cols = 3; // Number of columns in the grid
      const boxWidth = Math.min(200, width / cols);
      const boxHeight = 40;
      
      const col = missingBoxCount % cols;
      const row = Math.floor(missingBoxCount / cols);
      
      const rectX = col * (boxWidth + 10) + 10;
      const rectY = row * (boxHeight + 10) + 10;
      
      // Add rectangle with default positioning
      svg += `<rect x="${rectX}" y="${rectY}" width="${boxWidth}" height="${boxHeight}" 
                fill="black" fill-opacity="1" />`;
      
      // Add text label if available
      if (field.label) {
        svg += `<text x="${rectX + boxWidth/2}" y="${rectY + boxHeight/2}" 
                text-anchor="middle" alignment-baseline="middle" 
                font-family="Arial" font-size="10" fill="white">${field.label}</text>`;
      }
      
      missingBoxCount++;
    }
  })
  
  // Close SVG
  svg += "</svg>"
  
  return svg
} 