// Client-side text analysis and redaction utilities

// Common PII patterns
const PII_PATTERNS = {
  // SSN: 3 digits, 2 digits, 4 digits with dashes
  SSN: /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/g,
  
  // Credit Card: 16 digits (sometimes with dashes or spaces)
  CREDIT_CARD: /\b(?:\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}|\d{16})\b/g,
  
  // Phone Number: Various formats
  PHONE: /\b(?:\+?1[-\s]?)?(?:\(\d{3}\)|\d{3})[-\s]?\d{3}[-\s]?\d{4}\b/g,
  
  // Email Address
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Date of Birth
  DOB: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g,
  
  // Address components
  ZIP_CODE: /\b\d{5}(?:-\d{4})?\b/g,
  
  // Names - harder to detect with regex alone, 
  // but this will catch many common name patterns (2 capitalized words)
  NAME: /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g,
}

// Names of months to help with date detection
const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]

// Common titles to help with name detection
const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof"]

/**
 * Analyzes text to find potential PII using regex patterns
 */
export function findPotentialPII(text: string): {
  type: string;
  text: string;
  index: number;
  length: number;
}[] {
  const results: {
    type: string;
    text: string;
    index: number;
    length: number;
  }[] = []
  
  // Search for each PII pattern
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = [...text.matchAll(pattern)]
    for (const match of matches) {
      if (match.index !== undefined) {
        results.push({
          type,
          text: match[0],
          index: match.index,
          length: match[0].length
        })
      }
    }
  }
  
  // Look for dates with month names (not caught by the DOB regex)
  for (const month of MONTHS) {
    const monthPattern = new RegExp(`\\b${month}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[,]\\s*\\d{4})?\\b`, 'gi')
    const matches = [...text.matchAll(monthPattern)]
    for (const match of matches) {
      if (match.index !== undefined) {
        results.push({
          type: 'DATE',
          text: match[0],
          index: match.index,
          length: match[0].length
        })
      }
    }
  }
  
  // Look for names with titles (Mr. John Smith)
  for (const title of TITLES) {
    const titlePattern = new RegExp(`\\b${title}\\.?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\b`, 'g')
    const matches = [...text.matchAll(titlePattern)]
    for (const match of matches) {
      if (match.index !== undefined) {
        results.push({
          type: 'NAME',
          text: match[0],
          index: match.index,
          length: match[0].length
        })
      }
    }
  }
  
  return results
}

/**
 * Generate HTML with highlighted PII
 */
export function generateHighlightedHTML(text: string, piiResults: ReturnType<typeof findPotentialPII>): string {
  // Sort by index in reverse order so we can modify the string
  // from end to beginning without affecting other indices
  const sortedResults = [...piiResults].sort((a, b) => b.index - a.index)
  
  let highlightedText = text
  
  for (const result of sortedResults) {
    const { index, length, type } = result
    const beforeText = highlightedText.substring(0, index)
    const afterText = highlightedText.substring(index + length)
    const highlightedSection = `<span class="pii-highlight pii-${type.toLowerCase()}" data-pii-type="${type}">${highlightedText.substring(index, index + length)}</span>`
    
    highlightedText = beforeText + highlightedSection + afterText
  }
  
  // Convert newlines to <br> for HTML display
  highlightedText = highlightedText.replace(/\n/g, '<br>')
  
  return highlightedText
}

/**
 * Redact identified PII from text
 */
export function redactPII(text: string, piiToRedact: string[]): string {
  let redactedText = text
  
  for (const piiText of piiToRedact) {
    // Escape special regex characters
    const escapedText = piiText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedText, 'g')
    
    // Replace with 'X' characters of the same length
    redactedText = redactedText.replace(regex, '█'.repeat(piiText.length))
  }
  
  return redactedText
}

/**
 * Process a PDF document and identify potential PII
 * This is a placeholder for the integrated function that would
 * combine PDF.js extraction with PII detection
 */
export async function analyzeDocumentForPII(file: File): Promise<{
  text: string;
  piiFound: ReturnType<typeof findPotentialPII>;
  highlightedHTML: string;
}> {
  // This is a placeholder - in a real implementation, this would:
  // 1. Use PDF.js to extract text from the PDF
  // 2. Analyze the text for PII
  // 3. Return the results
  
  throw new Error('Not implemented yet - this is just a placeholder function')
} 