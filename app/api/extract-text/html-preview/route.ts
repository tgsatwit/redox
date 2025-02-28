import { NextResponse } from "next/server"
import { createId } from "@paralleldrive/cuid2"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
})

// This endpoint uploads the PDF to S3 and returns HTML for embedding it
export async function POST(request: Request) {
  console.log("HTML preview API called")
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      console.log("No file provided")
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    console.log(`File received: ${file.name}, type: ${file.type}, size: ${file.size} bytes`)

    if (file.type !== "application/pdf") {
      console.log(`Unsupported file type: ${file.type}`)
      return NextResponse.json(
        { error: `Only PDF files are supported by this endpoint.` },
        { status: 400 }
      )
    }

    try {
      // Upload the PDF to S3 to allow for direct viewing
      const fileBuffer = await file.arrayBuffer()
      const fileBytes = new Uint8Array(fileBuffer)
      
      // Generate a unique ID for the file
      const fileId = createId()
      const key = `previews/${fileId}-${file.name}`
      
      console.log(`Uploading to S3 for preview: ${key}`)

      // Upload to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key,
          Body: fileBytes,
          ContentType: file.type,
          ACL: 'public-read', // Make publicly accessible for viewing
        })
      )
      
      // Construct the S3 URL
      const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`
      console.log(`PDF uploaded for preview at: ${s3Url}`)
      
      // Generate HTML for embedding the PDF
      const htmlPreview = `
<!DOCTYPE html>
<html>
<head>
  <title>PDF Preview: ${file.name}</title>
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    .container { max-width: 100%; height: 100vh; overflow: hidden; }
    .pdf-viewer { width: 100%; height: 100%; border: none; }
    .error-msg { padding: 20px; color: #e11d48; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <object class="pdf-viewer" data="${s3Url}" type="application/pdf">
      <div class="error-msg">
        <p>The PDF cannot be displayed in your browser.</p>
        <p><a href="${s3Url}" target="_blank">Click here to download the PDF</a></p>
      </div>
    </object>
  </div>
</body>
</html>
      `.trim()
      
      // Return both the HTML preview and the S3 URL
      return NextResponse.json({
        extractedText: `This PDF couldn't be processed for text extraction, but you can view it online. The document is available at: ${s3Url}`,
        htmlPreview: htmlPreview,
        pdfUrl: s3Url,
        method: "html-preview",
      })
      
    } catch (s3Error) {
      console.error("S3 upload failed:", s3Error)
      return NextResponse.json(
        { 
          error: "Failed to generate preview", 
          details: s3Error instanceof Error ? s3Error.message : "Unknown error",
          extractedText: "Could not generate a preview for this PDF. Please try downloading it directly."
        },
        { status: 422 }
      )
    }
  } catch (error) {
    console.error("Error generating HTML preview:", error)
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "An unknown error occurred",
        extractedText: "Error processing document for preview."  
      },
      { status: 500 }
    )
  }
} 