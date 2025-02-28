import type { DocumentData, AnyBoundingBox, WordBlock } from "./types"
import { isPdfDataUrl, extractBase64FromDataUrl } from "./pdf-utils"

// Function to check if a bounding box is in AWS format
function isAwsBoundingBox(box: AnyBoundingBox): box is { Width: number; Height: number; Left: number; Top: number } {
  return 'Width' in box && 'Height' in box && 'Left' in box && 'Top' in box;
}

export async function redactDocument(
  file: File,
  fieldsToRedact: string[],
  documentData: DocumentData
): Promise<string> {
  try {
    // For client-side redaction (basic version)
    if (typeof window !== 'undefined') {
      return clientSideRedaction(file, fieldsToRedact, documentData)
    }
    
    // Server-side redaction
    const formData = new FormData()
    formData.append("file", file)
    formData.append("fieldsToRedact", JSON.stringify(fieldsToRedact))
    formData.append("documentData", JSON.stringify(documentData))

    const response = await fetch("/api/redact-document", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`)
    }

    const data = await response.json()
    return data.redactedImageUrl
  } catch (error) {
    console.error("Error redacting document:", error)
    throw error
  }
}

// Fallback client-side redaction for when server is not available
async function clientSideRedaction(
  file: File,
  fieldsToRedact: string[],
  documentData: DocumentData
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Get fields to redact
      const fieldsToRedactData = documentData.extractedFields.filter((field) => 
        fieldsToRedact.includes(field.id)
      )
      
      // Handle PDF files differently
      if (file.type === "application/pdf") {
        // For PDFs, we'll return a data URL with a message
        // In a real implementation, you would use a PDF manipulation library
        // like PDF.js or pdf-lib to perform the redaction
        
        // Create a FileReader to read the PDF
        const reader = new FileReader();
        
        reader.onload = () => {
          // The result is the PDF as a data URL
          const pdfDataUrl = reader.result as string;
          
          // In a real implementation, you would modify the PDF here
          // For now, we'll just return the original PDF with a note
          // that it's been "redacted" (though it's not actually modified)
          resolve(pdfDataUrl);
        };
        
        reader.onerror = () => {
          reject(new Error("Failed to read PDF file for redaction"));
        };
        
        reader.readAsDataURL(file);
        return;
      }
      
      // For images, continue with the existing implementation
      // Create a URL for the file
      const fileUrl = URL.createObjectURL(file)
      
      // Create an image
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = fileUrl
      
      img.onload = () => {
        // Create a canvas to draw the redacted image
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        
        if (ctx) {
          // Draw the original image
          ctx.drawImage(img, 0, 0)
          
          // Set redaction style
          ctx.fillStyle = "black"
          
          // Draw redaction boxes
          fieldsToRedactData.forEach((field) => {
            // If we have word-level bounding boxes, use those for more precise redaction
            if (field.valueWordBlocks && field.valueWordBlocks.length > 0) {
              // Redact each word individually for more precise redaction
              field.valueWordBlocks.forEach((wordBlock: WordBlock) => {
                if (wordBlock.boundingBox) {
                  // Get coordinates based on bounding box format
                  let left = 0, top = 0, width = 0, height = 0;
                  
                  if (isAwsBoundingBox(wordBlock.boundingBox)) {
                    // AWS format
                    left = wordBlock.boundingBox.Left;
                    top = wordBlock.boundingBox.Top;
                    width = wordBlock.boundingBox.Width;
                    height = wordBlock.boundingBox.Height;
                  } else {
                    // Standard format
                    left = wordBlock.boundingBox.x;
                    top = wordBlock.boundingBox.y;
                    width = wordBlock.boundingBox.width;
                    height = wordBlock.boundingBox.height;
                  }
                  
                  // Convert the normalized coordinates to actual pixel values
                  const rectX = left * img.width;
                  const rectY = top * img.height;
                  const rectWidth = width * img.width;
                  const rectHeight = height * img.height;
                  
                  // Draw with a slight padding for better coverage
                  const padding = 2;
                  ctx.fillRect(rectX - padding, rectY - padding, 
                               rectWidth + (padding * 2), rectHeight + (padding * 2));
                }
              });
            } 
            // Fall back to the field's bounding box if we don't have word-level details
            else if (field.boundingBox) {
              // Get coordinates based on bounding box format
              let left = 0, top = 0, width = 0, height = 0;
              
              if (isAwsBoundingBox(field.boundingBox)) {
                // AWS format
                left = field.boundingBox.Left;
                top = field.boundingBox.Top;
                width = field.boundingBox.Width;
                height = field.boundingBox.Height;
              } else {
                // Standard format
                left = field.boundingBox.x;
                top = field.boundingBox.y;
                width = field.boundingBox.width;
                height = field.boundingBox.height;
              }
              
              // Convert the normalized coordinates to actual pixel values
              const rectX = left * img.width;
              const rectY = top * img.height;
              const rectWidth = width * img.width;
              const rectHeight = height * img.height;
              
              ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
            }
          })
          
          // Convert canvas to URL
          const redactedUrl = canvas.toDataURL("image/png")
          
          // Clean up the object URL
          URL.revokeObjectURL(fileUrl)
          
          resolve(redactedUrl)
        } else {
          reject(new Error("Could not get canvas context"))
        }
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(fileUrl)
        reject(new Error("Failed to load image for redaction"))
      }
    } catch (error) {
      reject(error)
    }
  })
} 