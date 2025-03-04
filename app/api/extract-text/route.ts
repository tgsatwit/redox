import { NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import {
  TextractClient,
  AnalyzeDocumentCommand,
  DetectDocumentTextCommand,
  FeatureType,
} from "@aws-sdk/client-textract"
import { createId } from "@paralleldrive/cuid2"
import pdfParse from "pdf-parse"
// Note: We're not importing Tesseract here because it doesn't work well in serverless environments
// We'll use a different approach for images

const s3Client = new S3Client({
  region: process.env.APP_REGION || "us-east-1",
})

const textractClient = new TextractClient({
  region: process.env.APP_REGION || "us-east-1",
})

export async function POST(request: Request) {
  console.log("Extract text API called")
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

    // Check file type
    const validTypes = [
      "application/pdf",
      "image/jpeg", 
      "image/jpg",
      "image/png", 
      "image/tiff"
    ]
    
    if (!validTypes.includes(file.type)) {
      console.log(`Unsupported file type: ${file.type}`)
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Please upload a PDF or image.` },
        { status: 400 }
      )
    }

    // Get file buffer
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)
    console.log(`File buffer created, length: ${fileBytes.length} bytes`)

    // For PDF files, try using pdf-parse directly first as it handles more PDF formats
    if (file.type === "application/pdf") {
      try {
        console.log("Attempting direct PDF extraction with pdf-parse first")
        const buffer = Buffer.from(fileBytes)
        
        // Log first few bytes to help diagnose PDF issues
        console.log(`PDF header bytes: ${Array.from(buffer.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
        
        // Try to extract PDF info first to check if it's a valid PDF
        try {
          console.log("Checking PDF metadata...")
          // Just get info without parsing full text
          const pdfInfo = await pdfParse(buffer, { max: 1 }) 
          console.log(`PDF info: version=${pdfInfo.info?.PDFFormatVersion}, pages=${pdfInfo.numpages}, encrypted=${pdfInfo.info?.IsEncrypted ? 'yes' : 'no'}`)
        } catch (infoError) {
          console.error("Failed to get PDF metadata:", infoError)
        }
        
        // Now try full text extraction
        const pdfData = await pdfParse(buffer, {
          max: 0, // no limit on pages
        })
        
        console.log(`Direct PDF parsing successful, extracted ${pdfData.text.length} chars from ${pdfData.numpages} pages`)
        return NextResponse.json({
          extractedText: pdfData.text || "No text content found in PDF",
          pageCount: pdfData.numpages,
          method: "pdf-parse-direct",
        })
      } catch (directPdfError) {
        console.error("Direct PDF parsing failed:", directPdfError)
        
        // Try using a more robust approach for challenging PDFs
        try {
          console.log("Attempting alternate PDF parsing approach...")
          const buffer = Buffer.from(fileBytes)
          
          // Try pdf-parse with simpler options
          const pdfData = await pdfParse(buffer, {
            max: 0,
            // Don't use custom renderer for first attempt
          })
          
          if (pdfData.text && pdfData.text.trim().length > 0) {
            console.log(`Simple PDF parsing successful, extracted ${pdfData.text.length} chars`)
            return NextResponse.json({
              extractedText: pdfData.text,
              pageCount: pdfData.numpages,
              method: "pdf-parse-simple",
            })
          }
          
          console.log("Simple PDF parsing returned empty text, trying advanced approach...")
          // If we got here, simple parsing didn't work well. Try advanced approach.
        } catch (simplePdfError) {
          console.error("Simple PDF parsing failed:", simplePdfError)
          // Continue to advanced parsing
        }
        
        // Only proceed to Textract if we couldn't extract with pdf-parse
      }
    }

    // Try AWS Textract 
    try {
      // Generate a unique ID for the file
      const fileId = createId()
      const key = `uploads/${fileId}-${file.name}`
      console.log(`Uploading to S3: ${key}`)

      // Upload to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.APP_S3_BUCKET,
          Key: key,
          Body: fileBytes,
          ContentType: file.type,
        })
      )
      console.log("S3 upload successful")

      // Use DetectDocumentText for simple text extraction
      console.log("Calling Textract DetectDocumentText")
      const textractResponse = await textractClient.send(
        new DetectDocumentTextCommand({
          Document: {
            S3Object: {
              Bucket: process.env.APP_S3_BUCKET,
              Name: key,
            },
          },
        })
      )

      // Extract text from blocks
      const extractedText = textractResponse.Blocks
        ?.filter((block) => block.BlockType === "LINE")
        .map((block) => block.Text)
        .join("\n") || ""

      console.log(`Textract extraction successful, extracted ${extractedText.length} chars`)
      return NextResponse.json({
        extractedText,
        method: "aws-textract",
      })
    } catch (textractError) {
      console.error("Textract error:", textractError)
      
      // For PDFs that failed initial direct parsing, try one more approach
      if (file.type === "application/pdf") {
        console.log("Using pdf-parse with custom options for difficult PDF")
        try {
          // Try pdf-parse with different options for problem PDFs
          const buffer = Buffer.from(fileBytes)
          
          // Customize pdf-parse options to handle difficult PDFs
          const pdfData = await pdfParse(buffer, {
            max: 0,
            pagerender: function render_page(pageData: any) {
              let render_options = {
                normalizeWhitespace: true,
                disableCombineTextItems: false
              }
              return pageData.getTextContent(render_options)
                .then(function(textContent: any) {
                  let text = "";
                  let lastY = -1;
                  for (let item of textContent.items) {
                    if (lastY !== item.transform[5]) {
                      text += "\n";
                    }
                    text += item.str;
                    lastY = item.transform[5];
                  }
                  return text;
                });
            }
          })
          
          console.log(`Advanced PDF parsing successful, extracted ${pdfData.text.length} chars`)
          return NextResponse.json({
            extractedText: pdfData.text || "No text content found in PDF",
            pageCount: pdfData.numpages,
            method: "pdf-parse-advanced",
          })
        } catch (pdfError) {
          console.error("All PDF parsing methods failed:", pdfError)
          
          // Try calling the fallback PDF endpoint for problematic PDFs
          try {
            console.log("Attempting fallback PDF extraction service")
            
            // Create a new FormData object with the file
            const fallbackFormData = new FormData()
            fallbackFormData.append("file", file)
            
            // Make an internal request to our fallback endpoint
            const fallbackResponse = await fetch(
              // Use URL constructor to ensure we're using the right origin
              new URL("/api/extract-text/fallback-pdf", request.url).toString(),
              {
                method: "POST",
                body: fallbackFormData,
              }
            )
            
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json()
              console.log("Fallback extraction completed")
              return NextResponse.json({
                extractedText: fallbackData.extractedText,
                method: "fallback-direct",
                note: "This document required special processing due to its format."
              })
            } else {
              console.error("Fallback extraction failed:", await fallbackResponse.text())
            }
          } catch (fallbackError) {
            console.error("Error using fallback extraction:", fallbackError)
          }
          
          // If we get here, all methods including fallback have failed
          // Provide detailed error for the user
          let errorMessage = "Failed to extract text from PDF"
          if (pdfError instanceof Error) {
            if (pdfError.message.includes("encrypted")) {
              errorMessage = "The PDF is password-protected or encrypted and cannot be processed"
            } else if (pdfError.message.includes("malformed") || pdfError.message.includes("invalid")) {
              errorMessage = "The PDF file appears to be corrupted or malformed"
            } else if (pdfError.message.includes("not a PDF file")) {
              errorMessage = "The file does not appear to be a valid PDF"
            } else if (pdfError.message.includes("file is damaged")) {
              errorMessage = "The PDF file appears to be damaged"
            }
          }
          
          return NextResponse.json(
            { 
              error: errorMessage, 
              details: pdfError instanceof Error ? pdfError.message : "Unknown error",
              extractedText: "Failed to extract text. This PDF may be protected, scanned, or in an unsupported format."
            },
            { status: 422 }
          )
        }
      } else {
        console.log("Image file processing failed")
        // For images, suggest client-side processing but still return a useful response
        return NextResponse.json({
          error: "This image could not be processed by AWS Textract. It may be in an unsupported format or contain no recognizable text.",
          details: textractError instanceof Error ? textractError.message : "Unknown error processing image",
          extractedText: "Text extraction failed. The image format may be unsupported or contain no recognizable text.",
          method: "failed",
        }, 
        { status: 422 })
      }
    }
  } catch (error) {
    console.error("Error extracting text:", error)
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "An unknown error occurred",
        extractedText: "Error processing document. Please try a different file format."  
      },
      { status: 500 }
    )
  }
} 