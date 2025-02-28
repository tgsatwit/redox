"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { ZoomIn, ZoomOut, RotateCw, FileText, Image as ImageIcon, AlignLeft, Loader2, AlertTriangle, RefreshCw, FileSearch, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { findPotentialPII, generateHighlightedHTML } from "@/lib/client-redaction"
import { 
  isPdfDataUrl, 
  convertBase64ToFile, 
  createCompatiblePdfBlob, 
  createHtmlPdfViewerBlob, 
  createPdfDownloadLink
} from "@/lib/pdf-utils"
import { ensurePdfJsLoaded } from "@/lib/pdf-preloader" 
import { Card } from "@/components/ui/card"

// We don't need to redeclare the window interface as it's already declared in pdf-preloader.ts
// The TypeScript compiler will merge the declarations automatically

// Define the type for a manual selection
interface ManualSelection {
  id: string;
  label: string;
  boundingBox: {
    Left: number;
    Top: number;
    Width: number;
    Height: number;
  };
}

interface DocumentViewerProps {
  imageUrl: string
  fileType?: string
  extractedText?: string
  textError?: string
  onRequestPageByPageProcessing?: () => void
  onPdfLoadError?: (error: string | null) => void
  redactionElements?: Array<{ id: string; boundingBox?: { Left: number; Top: number; Width: number; Height: number } }>
  onSelectionAdded?: (selection: ManualSelection) => void
}

// Helper function to safely render boundingBox properties
const renderBoundingBoxStyle = (box?: any): React.CSSProperties => {
  if (!box) return {}
  
  // Check whether it's AWS style (with Left, Top) or standard style (with x, y)
  const left = 'Left' in box ? box.Left * 100 : ('x' in box ? box.x * 100 : 0)
  const top = 'Top' in box ? box.Top * 100 : ('y' in box ? box.y * 100 : 0)
  const width = 'Width' in box ? box.Width * 100 : ('width' in box ? box.width * 100 : 0)
  const height = 'Height' in box ? box.Height * 100 : ('height' in box ? box.height * 100 : 0)
  
  return {
    position: 'absolute' as const, // Use 'as const' to narrow the type
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`
  }
}

export function DocumentViewer({
  imageUrl,
  fileType,
  extractedText,
  textError,
  onRequestPageByPageProcessing,
  onPdfLoadError,
  redactionElements = [],
  onSelectionAdded
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isPdf, setIsPdf] = useState(false)
  const [isAnalyzingPII, setIsAnalyzingPII] = useState(false)
  const [piiResults, setPiiResults] = useState<ReturnType<typeof findPotentialPII> | null>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null)
  const [isReloadingPdf, setIsReloadingPdf] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isBrowserBlocking, setIsBrowserBlocking] = useState(false)
  const [pdfLoadAttempts, setPdfLoadAttempts] = useState(0)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [pdfPageRendering, setPdfPageRendering] = useState(false)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfTotalPages, setPdfTotalPages] = useState(0)
  
  // State for annotation mode
  const [isAnnotationMode, setIsAnnotationMode] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null)
  const [showLabelDialog, setShowLabelDialog] = useState(false)
  const [selectionLabel, setSelectionLabel] = useState('')
  const [manualSelections, setManualSelections] = useState<ManualSelection[]>([])
  
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Listen for messages from the iframe to detect Chrome blocking
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'pdf-load-error') {
        handlePdfLoadError(event.data.message || 'PDF blocked by browser');
        setIsBrowserBlocking(true);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
  
  // Add a function to render a PDF page using PDF.js directly
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocument || !canvasRef.current) return;
    
    try {
      setPdfPageRendering(true);
      
      // Get page
      const page = await pdfDocument.getPage(pageNum);
      
      // Set viewport based on current zoom
      const viewport = page.getViewport({ scale: zoom, rotation: rotation });
      
      // Set canvas dimensions
      const canvas = canvasRef.current;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page into canvas context
      const renderContext = {
        canvasContext: canvas.getContext('2d')!,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      setPdfPageRendering(false);
      
    } catch (error) {
      console.error('Error rendering PDF page:', error);
      setPdfPageRendering(false);
      setPdfLoadError(`Error rendering page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [pdfDocument, zoom, rotation]);
  
  // Function to load PDF using PDF.js
  const loadPdfWithPdfJs = useCallback(async (url: string) => {
    try {
      // Reset states
      setPdfDocument(null);
      setPdfLoadError(null);
      setPdfCurrentPage(1);
      setPdfTotalPages(0);
      
      // Ensure PDF.js is loaded
      await ensurePdfJsLoaded();
      
      // Load PDF document
      if (!window.pdfjsLib) {
        throw new Error("PDF.js library not loaded properly");
      }
      const loadingTask = window.pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      
      setPdfDocument(pdf);
      setPdfTotalPages(pdf.numPages);
      console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
      
      // Render first page
      if (pdf.numPages > 0) {
        renderPage(1);
      }
      
      return true;
    } catch (error) {
      console.error("Error loading PDF:", error);
      setPdfLoadError(`Failed to load PDF: ${error instanceof Error ? error.message : String(error)}`);
      
      if (onPdfLoadError) {
        onPdfLoadError(`Failed to load PDF: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      return false;
    }
  }, [renderPage, onPdfLoadError]);
  
  // Navigate to a different page
  const changePage = useCallback((offset: number) => {
    if (!pdfDocument) return;
    
    const newPage = pdfCurrentPage + offset;
    if (newPage >= 1 && newPage <= pdfTotalPages && !pdfPageRendering) {
      setPdfCurrentPage(newPage);
      renderPage(newPage);
    }
  }, [pdfDocument, pdfCurrentPage, pdfTotalPages, pdfPageRendering, renderPage]);
  
  // Effects that manage PDF loading and rendering
  useEffect(() => {
    // Reset PDF state when imageUrl or fileType changes
    setIsPdf(Boolean(
      imageUrl?.endsWith('.pdf') || 
      fileType === 'application/pdf' || 
      (imageUrl && isPdfDataUrl(imageUrl))
    ));
    
    // Reset PDF error states and attempts
    setPdfLoadError(null);
    setIsReloadingPdf(false);
    setIsBrowserBlocking(false);
    setPdfLoadAttempts(0);
    
    // For PDFs, use PDF.js to load and render the file
    if (imageUrl && (imageUrl.endsWith('.pdf') || fileType === 'application/pdf' || isPdfDataUrl(imageUrl))) {
      // Load PDF directly using PDF.js instead of trying iframe
      loadPdfWithPdfJs(imageUrl);
    }
    
    // Cleanup any created object URLs
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageUrl, fileType, loadPdfWithPdfJs, objectUrl]);
  
  // Re-render when zoom or rotation changes
  useEffect(() => {
    if (pdfDocument && pdfCurrentPage <= pdfTotalPages) {
      renderPage(pdfCurrentPage);
    }
  }, [zoom, rotation, pdfDocument, pdfCurrentPage, pdfTotalPages, renderPage]);
  
  // Reset PII analysis when text changes
  useEffect(() => {
    setPiiResults(null)
    setHighlightedHtml(null)
  }, [extractedText])

  // Add a function to detect Chrome blocking
  const detectChromeBlocking = useCallback(() => {
    if (!iframeRef.current) return;
    
    try {
      // Try to access the iframe content
      const iframeDoc = iframeRef.current.contentDocument || (iframeRef.current.contentWindow?.document);
      
      if (iframeDoc) {
        const bodyText = iframeDoc.body?.textContent || '';
        const pageTitle = iframeDoc.title || '';
        
        // Check for Chrome blocking message
        if (bodyText.includes('blocked by Chrome') || 
            pageTitle.includes('blocked by Chrome') ||
            bodyText.includes('has been blocked') ||
            pageTitle.includes('has been blocked')) {
          console.log('Chrome blocking detected in iframe content');
          setIsBrowserBlocking(true);
          const errorMessage = "This PDF has been blocked by Chrome for security reasons.";
          setPdfLoadError(errorMessage);
          
          // Notify parent component if callback exists
          if (onPdfLoadError) {
            onPdfLoadError(errorMessage);
          }
          
          return true;
        }
      }
    } catch (e) {
      // If we can't access the iframe content due to security restrictions
      console.warn('Cannot access iframe content, possible security restriction:', e);
      return false;
    }
    
    return false;
  }, [onPdfLoadError]);
  
  // Try to detect Chrome blocking by checking iframe content 
  useEffect(() => {
    if (!isPdf || !iframeRef.current) return;

    // Give iframe time to load, then check if it's been blocked
    const timer = setTimeout(() => {
      detectChromeBlocking();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isPdf, pdfLoadAttempts, objectUrl, detectChromeBlocking]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.1, 3))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5))
  }

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360)
  }
  
  const handleAnalyzePII = () => {
    if (!extractedText) return

    setIsAnalyzingPII(true)
    
    try {
      // This could be moved to a web worker for better performance with large documents
      const results = findPotentialPII(extractedText)
      setPiiResults(results)
      
      if (results.length > 0) {
        const html = generateHighlightedHTML(extractedText, results)
        setHighlightedHtml(html)
      }
    } catch (error) {
      console.error("Error analyzing text for PII:", error)
    } finally {
      setIsAnalyzingPII(false)
    }
  }
  
  const handlePdfLoadError = (errorMessage?: string) => {
    console.error("PDF failed to load in iframe:", errorMessage || "Unknown error")
    const message = errorMessage || "The PDF failed to load. This might be due to browser security restrictions or an issue with the PDF format."
    setPdfLoadError(message)
    setPdfLoadAttempts(prev => prev + 1)
    
    // Notify parent component if callback exists
    if (onPdfLoadError) {
      onPdfLoadError(message)
    }
  }
  
  // Enhanced PDF reload function
  const handleReloadPdf = async () => {
    setIsReloadingPdf(true);
    setPdfLoadError(null);
    setIsBrowserBlocking(false);
    
    if (imageUrl) {
      await loadPdfWithPdfJs(imageUrl);
    }
    
    setIsReloadingPdf(false);
  }
  
  const handlePageByPageRequest = () => {
    if (onRequestPageByPageProcessing) {
      onRequestPageByPageProcessing()
    }
  }
  
  // Mouse event handlers for selection/annotation
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAnnotationMode || !containerRef.current) return;
    
    // Start drawing
    setIsDrawing(true);
    
    // Get container position and dimensions
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Set start position (normalized coordinates 0-1)
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y }); // Initialize end to same as start
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAnnotationMode || !isDrawing || !containerRef.current || !selectionStart) return;
    
    // Get container position and dimensions
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    // Set end position (normalized coordinates 0-1)
    setSelectionEnd({ x, y });
  };
  
  const handleMouseUp = () => {
    if (!isAnnotationMode || !isDrawing || !selectionStart || !selectionEnd) return;
    
    // Stop drawing
    setIsDrawing(false);
    
    // Calculate the bounding box (ensure left, top, width, height are correct)
    const left = Math.min(selectionStart.x, selectionEnd.x);
    const top = Math.min(selectionStart.y, selectionEnd.y);
    const width = Math.abs(selectionEnd.x - selectionStart.x);
    const height = Math.abs(selectionEnd.y - selectionStart.y);
    
    // Only show dialog if the selection has a meaningful size
    if (width > 0.01 && height > 0.01) {
      setShowLabelDialog(true);
    } else {
      // Reset selection if too small
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  };
  
  // Handle adding a new selection
  const handleAddSelection = () => {
    if (!selectionStart || !selectionEnd || !selectionLabel.trim()) {
      setShowLabelDialog(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }
    
    // Calculate the bounding box (ensure left, top, width, height are correct)
    const left = Math.min(selectionStart.x, selectionEnd.x);
    const top = Math.min(selectionStart.y, selectionEnd.y);
    const width = Math.abs(selectionEnd.x - selectionStart.x);
    const height = Math.abs(selectionEnd.y - selectionStart.y);
    
    // Create the selection object
    const newSelection: ManualSelection = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      label: selectionLabel,
      boundingBox: {
        Left: left,
        Top: top,
        Width: width,
        Height: height
      }
    };
    
    // Add to local state
    setManualSelections([...manualSelections, newSelection]);
    
    // Notify parent component if callback exists
    if (onSelectionAdded) {
      onSelectionAdded(newSelection);
    }
    
    // Reset state
    setShowLabelDialog(false);
    setSelectionLabel('');
    setSelectionStart(null);
    setSelectionEnd(null);
  };
  
  // Cancel current selection
  const handleCancelSelection = () => {
    setShowLabelDialog(false);
    setSelectionLabel('');
    setSelectionStart(null);
    setSelectionEnd(null);
  };
  
  // Toggle annotation mode
  const toggleAnnotationMode = () => {
    setIsAnnotationMode(!isAnnotationMode);
  };
  
  // Check if the extracted text might be an error message
  const isErrorText = extractedText && (extractedText.startsWith('Error:') || extractedText.toLowerCase().includes('cannot be processed'))
  
  // Add this function for template application
  const applyRedactionTemplate = useCallback((templateType: 'passport' | 'driverLicense') => {
    if (!containerRef.current || !onSelectionAdded) return
    
    const containerRect = containerRef.current.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height
    
    // Define templates with relative positioning (percentages)
    const templates = {
      passport: [
        { label: 'Passport Number', Left: 0.7, Top: 0.05, Width: 0.25, Height: 0.05 },
        { label: 'Date of Birth', Left: 0.7, Top: 0.15, Width: 0.25, Height: 0.05 },
        { label: 'Name', Left: 0.3, Top: 0.25, Width: 0.4, Height: 0.05 },
        { label: 'MRZ Line 1', Left: 0.1, Top: 0.85, Width: 0.8, Height: 0.05 },
        { label: 'MRZ Line 2', Left: 0.1, Top: 0.92, Width: 0.8, Height: 0.05 }
      ],
      driverLicense: [
        { label: 'License Number', Left: 0.65, Top: 0.3, Width: 0.3, Height: 0.05 },
        { label: 'Name', Left: 0.3, Top: 0.2, Width: 0.4, Height: 0.05 },
        { label: 'Address', Left: 0.3, Top: 0.4, Width: 0.6, Height: 0.1 },
        { label: 'Date of Birth', Left: 0.3, Top: 0.55, Width: 0.3, Height: 0.05 },
        { label: 'Issue/Expiry Date', Left: 0.6, Top: 0.55, Width: 0.3, Height: 0.05 }
      ]
    }
    
    // Apply the selected template
    templates[templateType].forEach(template => {
      onSelectionAdded({
        id: `template-${templateType}-${template.label}-${Date.now()}`,
        label: template.label,
        boundingBox: {
          Left: template.Left,
          Top: template.Top,
          Width: template.Width,
          Height: template.Height
        }
      })
    })
  }, [onSelectionAdded, containerRef])
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">Document Viewer</h3>
          {isPdf ? (
            <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span>PDF</span>
            </div>
          ) : (
            <div className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              <span>Image</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleRotate} title="Rotate">
            <RotateCw className="h-4 w-4" />
          </Button>
          
          {/* Add annotation mode toggle button */}
          <Button 
            variant={isAnnotationMode ? "default" : "outline"} 
            size="icon" 
            onClick={toggleAnnotationMode}
            title={isAnnotationMode ? "Exit Annotation Mode" : "Enter Annotation Mode"}
            className={isAnnotationMode ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
          >
            <Scissors className="h-4 w-4" />
          </Button>
          
          {/* Add template buttons */}
          {onSelectionAdded && (
            <>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => applyRedactionTemplate('passport')}
                title="Apply Passport Template"
              >
                <FileSearch className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => applyRedactionTemplate('driverLicense')}
                title="Apply Driver's License Template"
              >
                <FileSearch className="h-4 w-4" />
              </Button>
            </>
          )}
          
          {isPdf && pdfDocument && pdfTotalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => changePage(-1)}
                disabled={pdfCurrentPage <= 1 || pdfPageRendering}
              >
                Prev
              </Button>
              <span className="text-sm mx-1">
                {pdfCurrentPage} / {pdfTotalPages}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => changePage(1)}
                disabled={pdfCurrentPage >= pdfTotalPages || pdfPageRendering}
              >
                Next
              </Button>
            </div>
          )}
          {isPdf && (pdfLoadError || isBrowserBlocking) && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleReloadPdf}
              disabled={isReloadingPdf}
              title="Try reloading PDF"
            >
              {isReloadingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="w-full">
        <div 
          className={`overflow-auto border rounded-lg bg-muted/30 flex items-center justify-center p-4 h-[500px] relative ${isAnnotationMode ? 'cursor-crosshair' : ''}`}
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => isDrawing && handleMouseUp()}
        >
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              {pdfLoadError || isBrowserBlocking ? (
                <Card className="p-6 flex flex-col items-center justify-center gap-4 max-w-md mx-auto">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <h3 className="text-lg font-medium text-center">PDF Rendering Error</h3>
                  <p className="text-sm text-center text-muted-foreground">
                    {isBrowserBlocking 
                      ? "This page has been blocked by your browser for security reasons. Chrome restricts PDF rendering in certain contexts." 
                      : pdfLoadError}
                  </p>
                  
                  <div className="flex flex-col gap-2 w-full">
                    <Button 
                      onClick={handleReloadPdf} 
                      variant="outline"
                      disabled={isReloadingPdf}
                      className="w-full"
                    >
                      {isReloadingPdf ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Reloading PDF...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Try Reloading PDF
                        </>
                      )}
                    </Button>
                    
                    {/* Add download option for blocked PDFs */}
                    {(isBrowserBlocking || pdfLoadError) && imageUrl && (
                      <Button
                        onClick={() => {
                          const urlToDownload = objectUrl || imageUrl;
                          createPdfDownloadLink(urlToDownload, 'document.pdf');
                        }}
                        variant="outline"
                        className="w-full mt-1"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    )}
                    
                    {/* Add option for page-by-page processing */}
                    {onRequestPageByPageProcessing && (
                      <Button
                        onClick={handlePageByPageRequest}
                        variant="default"
                        className="w-full mt-1"
                      >
                        <FileSearch className="mr-2 h-4 w-4" />
                        Process PDF Page by Page
                      </Button>
                    )}
                  </div>
                </Card>
              ) : pdfPageRendering ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p>Rendering PDF...</p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center overflow-auto relative">
                  <canvas ref={canvasRef} className="max-w-full"></canvas>
                  {/* Display existing redaction elements */}
                  {redactionElements && redactionElements.length > 0 && pdfCurrentPage === 1 && (
                    redactionElements.map(element => element.boundingBox && (
                      <div 
                        key={element.id} 
                        style={{
                          ...renderBoundingBoxStyle(element.boundingBox),
                          backgroundColor: 'rgba(255, 0, 0, 0.2)',
                          border: '2px solid red'
                        }} 
                      />
                    ))
                  )}
                  
                  {/* Display manual selections */}
                  {manualSelections.map(selection => selection.boundingBox && (
                    <div 
                      key={selection.id} 
                      style={{
                        ...renderBoundingBoxStyle(selection.boundingBox),
                        backgroundColor: 'rgba(0, 0, 255, 0.2)',
                        border: '2px solid blue'
                      }}
                      title={selection.label}
                    >
                      <div className="absolute -top-6 left-0 bg-blue-600 text-white text-xs py-1 px-2 rounded truncate max-w-[150px]">
                        {selection.label}
                      </div>
                    </div>
                  ))}
                  
                  {/* Display current selection */}
                  {isAnnotationMode && selectionStart && selectionEnd && (
                    <div 
                      style={{
                        position: 'absolute',
                        left: `${Math.min(selectionStart.x, selectionEnd.x) * 100}%`,
                        top: `${Math.min(selectionStart.y, selectionEnd.y) * 100}%`,
                        width: `${Math.abs(selectionEnd.x - selectionStart.x) * 100}%`,
                        height: `${Math.abs(selectionEnd.y - selectionStart.y) * 100}%`,
                        backgroundColor: 'rgba(255, 255, 0, 0.2)',
                        border: '2px dashed orange'
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: "center",
                transition: "transform 0.2s ease-in-out",
              }}
              className="relative"
            >
              <img src={imageUrl || "/placeholder.svg"} alt="Document" className="max-w-full max-h-full object-contain" />
              
              {/* Display existing redaction elements */}
              {redactionElements && redactionElements.length > 0 && (
                redactionElements.map(element => element.boundingBox && (
                  <div 
                    key={element.id} 
                    style={{
                      ...renderBoundingBoxStyle(element.boundingBox),
                      backgroundColor: 'rgba(255, 0, 0, 0.2)',
                      border: '2px solid red'
                    }} 
                  />
                ))
              )}
              
              {/* Display manual selections */}
              {manualSelections.map(selection => selection.boundingBox && (
                <div 
                  key={selection.id} 
                  style={{
                    ...renderBoundingBoxStyle(selection.boundingBox),
                    backgroundColor: 'rgba(0, 0, 255, 0.2)',
                    border: '2px solid blue'
                  }}
                  title={selection.label}
                >
                  <div className="absolute -top-6 left-0 bg-blue-600 text-white text-xs py-1 px-2 rounded truncate max-w-[150px]">
                    {selection.label}
                  </div>
                </div>
              ))}
              
              {/* Display current selection */}
              {isAnnotationMode && selectionStart && selectionEnd && (
                <div 
                  style={{
                    position: 'absolute',
                    left: `${Math.min(selectionStart.x, selectionEnd.x) * 100}%`,
                    top: `${Math.min(selectionStart.y, selectionEnd.y) * 100}%`,
                    width: `${Math.abs(selectionEnd.x - selectionStart.x) * 100}%`,
                    height: `${Math.abs(selectionEnd.y - selectionStart.y) * 100}%`,
                    backgroundColor: 'rgba(255, 255, 0, 0.2)',
                    border: '2px dashed orange'
                  }}
                />
              )}
            </div>
          )}
          
          {/* Label dialog for new selections */}
          {showLabelDialog && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-4 rounded-lg shadow-lg border border-gray-300 z-10 min-w-[300px]">
              <h3 className="text-lg font-medium mb-2">Label Selection</h3>
              <div className="mb-4">
                <label htmlFor="selection-label" className="block text-sm font-medium mb-1">
                  Label
                </label>
                <input
                  id="selection-label"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={selectionLabel}
                  onChange={(e) => setSelectionLabel(e.target.value)}
                  placeholder="e.g., Name, Address, SSN"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCancelSelection}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddSelection}
                  disabled={!selectionLabel.trim()}
                >
                  Add Selection
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Only render text section if extractedText exists */}
        {extractedText && (
          <div className="overflow-auto border rounded-lg bg-white p-4 h-[500px] mt-4">
            {textError ? (
              <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                {textError}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Extracted Text</h3>
                  {!isAnalyzingPII && !piiResults && (
                    <Button 
                      onClick={handleAnalyzePII} 
                      variant="outline" 
                      size="sm"
                    >
                      Analyze for PII
                    </Button>
                  )}
                  {isAnalyzingPII && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Scanning for sensitive data...</span>
                    </div>
                  )}
                  {piiResults && piiResults.length > 0 && (
                    <div className="text-sm text-orange-600">
                      Found {piiResults.length} potential PII items
                    </div>
                  )}
                </div>
                
                <ScrollArea className="h-[400px] border border-border rounded-md p-4">
                  {highlightedHtml ? (
                    <div 
                      className="whitespace-pre-wrap font-mono text-sm"
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                  ) : (
                    <pre className={`text-sm whitespace-pre-wrap font-mono ${isErrorText ? 'text-red-600' : ''}`}>{extractedText}</pre>
                  )}
                </ScrollArea>
                
                {piiResults && piiResults.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-md font-medium mb-2">Potential Sensitive Information</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {piiResults.map((result, index) => (
                        <div 
                          key={index} 
                          className="border border-border rounded-md p-2 text-sm"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium">{result.type}</span>
                            <span className="text-xs text-muted-foreground">
                              Position: {result.index}
                            </span>
                          </div>
                          <div className="mt-1 font-mono bg-muted p-1 rounded text-xs overflow-hidden text-ellipsis">
                            {result.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

