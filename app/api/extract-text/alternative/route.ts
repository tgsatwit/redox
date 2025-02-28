import { NextResponse } from "next/server"
import pdfParse from "pdf-parse"

// This is a simple alternative that only uses pdf-parse without AWS Textract
export async function POST(request: Request) {
  console.log("Alternative PDF extraction API called")
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

    // Get file buffer
    const fileBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(fileBuffer)

    // Log first few bytes to help diagnose PDF issues
    console.log(`PDF header bytes: ${Array.from(buffer.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
    
    // Try the most basic approach first with minimal options
    try {
      console.log("Attempting very basic PDF extraction")
      const pdfData = await pdfParse(buffer, {
        max: 0, // no limit on pages
        version: 'default' // use default PDF.js version
      })
      
      console.log(`Basic PDF parsing successful, extracted ${pdfData.text.length} chars from ${pdfData.numpages} pages`)
      return NextResponse.json({
        extractedText: pdfData.text || "No text content found in PDF",
        pageCount: pdfData.numpages,
        method: "pdf-parse-basic",
      })
    } catch (basicError) {
      console.error("Basic PDF parsing failed:", basicError)
      
      // Try with even more minimal options
      try {
        console.log("Attempting fallback PDF parsing with minimal options")
        const pdfData = await pdfParse(buffer, {
          max: 10, // limit to first 10 pages to ensure it works
          version: 'v1.10.100' // try with a specific older version
        })
        
        console.log(`Fallback PDF parsing successful, extracted ${pdfData.text.length} chars`)
        return NextResponse.json({
          extractedText: pdfData.text || "No text content found in PDF",
          pageCount: pdfData.numpages,
          method: "pdf-parse-minimal",
          note: "Limited to first 10 pages due to compatibility issues"
        })
      } catch (fallbackError) {
        console.error("All PDF parsing methods failed:", fallbackError)
        
        return NextResponse.json(
          { 
            error: "Failed to extract text from this PDF format", 
            details: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
            extractedText: "This PDF couldn't be processed. It may be encrypted, password-protected, or damaged."
          },
          { status: 422 }
        )
      }
    }
  } catch (error) {
    console.error("Error in alternative PDF extraction:", error)
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "An unknown error occurred",
        extractedText: "Error processing document. Please try a different file format."  
      },
      { status: 500 }
    )
  }
} 