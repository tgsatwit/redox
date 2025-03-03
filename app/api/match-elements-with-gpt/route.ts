import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Define interfaces for type-safety
interface DataElementConfig {
  id: string;
  name: string;
  description?: string;
  category?: string;
  action?: string;
}

interface ExtractedElement {
  id: string;
  label?: string;
  text?: string;
  type?: string;
  category?: string;
  value?: string | null;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { extractedElements, configuredElements } = await request.json();

    if (!extractedElements || !Array.isArray(extractedElements)) {
      return NextResponse.json(
        { error: 'Missing or invalid extractedElements' },
        { status: 400 }
      );
    }

    if (!configuredElements || !Array.isArray(configuredElements)) {
      return NextResponse.json(
        { error: 'Missing or invalid configuredElements' },
        { status: 400 }
      );
    }

    // Prepare the configured elements information for the prompt
    const configElementsInfo = configuredElements.map((element: DataElementConfig) => 
      `- ID: ${element.id}, Name: "${element.name}"${element.description ? `, Description: "${element.description}"` : ''}${element.category ? `, Category: "${element.category}"` : ''}${element.action ? `, Action: "${element.action}"` : ''}`
    ).join('\n');

    // Prepare the extracted elements information for the prompt with more details
    const extractedElementsInfo = extractedElements.map((element: ExtractedElement) => {
      const label = element.label || 'Unknown';
      const text = element.text || element.value || 'Not available';
      const type = element.type || 'Unknown';
      
      return `- ID: ${element.id}, Label: "${label}", Text: "${text}", Type: "${type}"`;
    }).join('\n');

    // Create a more detailed prompt for GPT
    const prompt = `As a document data extraction expert, your task is to match extracted elements from a document with predefined configured data elements.

Configured Data Elements (what we expect to find in this document type):
${configElementsInfo}

Extracted Elements (what was actually found in this document):
${extractedElementsInfo}

MATCHING INSTRUCTIONS:
1. For each extracted element, determine if it matches one of the configured elements.
2. Use intelligent semantic matching to understand the meaning and context:
   - Match fields based on their semantic meaning (e.g., "Date of Birth" matches "DOB", "BIRTH_DATE", "DATE_OF_BIRTH", etc.)
   - Recognize common abbreviations and variations (e.g., "SSN", "Social Security Number")
   - Consider context of the document type when making matches
   - Ignore casing differences (e.g., "name" matches "NAME")
   - Treat underscores the same as spaces (e.g., "PLACE_OF_BIRTH" matches "Place of Birth")
   - Date fields typically contain date values in various formats
   - Names/IDs/numbers have characteristic patterns
3. IMPORTANT FIELD MATCHING RULES:
   - "DATE_OF_BIRTH" should match "Date of Birth"
   - "PLACE_OF_BIRTH" should match "Place of Birth"
   - "FIRST_NAME", "LAST_NAME", "GIVEN_NAME", "FAMILY_NAME" may match to "Full Name" if no specific match exists
   - "MRZ_CODE" or "MRZ" should match "MRZ Code"
   - "PASSPORT_NUMBER", "DOCUMENT_NUMBER", "ID_NUMBER" should match "Passport Number" or "Document Number"
   - Ignore casing and spacing/underscore differences
4. Be extremely cautious about field labels vs. actual values:
   - Some extracted "text" fields might just be translations/labels without actual values
   - If an extracted element contains text like "/ Date de naissance", this is likely a label translation, not a value
   - Actual values for date fields should look like dates (e.g., "01/01/1990")
   - Names should look like actual person names, not field labels
5. Assign confidence scores (0-1) that reflect certainty of matches
6. Provide brief reasoning for each match to explain your decision

For each extracted element, either match it to a configured element or mark it as unmatched.

Return your analysis in JSON format:
{
  "matches": [
    {
      "extractedElementId": "id of the extracted element",
      "configuredElementId": "id of the matching configured element, or null if no match",
      "confidence": <number between 0-1 indicating confidence level>,
      "reasoning": "Brief explanation of why this is a match"
    },
    // one entry for each extracted element that you found a match for
  ],
  "unmatchedElements": [
    {
      "extractedElementId": "id of the extracted element with no match",
      "suggestedCategory": "A logical category (PII, Financial, etc.)",
      "suggestedName": "A normalized name for this element"
    },
    // one entry for each unmatched extracted element
  ]
}`;

    // Call GPT-4o with a very low temperature for more deterministic matching
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: `You are an AI specialized in document data extraction, specifically matching extracted elements with configured elements.

KEY MATCHING PRINCIPLES:
1. Field names should be normalized:
   - Convert to lowercase for comparison
   - Remove underscores and replace with spaces
   - Treat different formatting of the same concept as identical

2. Common name equivalents:
   DATE_OF_BIRTH = Date of Birth = DOB = Birth Date
   PLACE_OF_BIRTH = Place of Birth = Birth Place = POB
   MRZ_CODE = MRZ Code = Machine Readable Zone
   PASSPORT_NUMBER = Passport Number = Document Number (for passport documents)
   FIRST_NAME + LAST_NAME might together match to Full Name

3. Focus on semantic meaning, not exact string matches
4. Always distinguish between field labels/headers and actual values
5. Properly explain your reasoning for each match

You must return valid JSON.`
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.01, // Very low temperature for deterministic results
    });
    
    // Get the GPT response and parse the JSON
    const gptResponse = completion.choices[0]?.message?.content;
    
    if (!gptResponse) {
      return NextResponse.json(
        { error: 'No response from matching model' },
        { status: 500 }
      );
    }
    
    try {
      const parsedResponse = JSON.parse(gptResponse);
      
      // Log the matching results for debugging
      console.log("Matching results:", {
        matchesCount: parsedResponse.matches?.length || 0,
        unmatchedCount: parsedResponse.unmatchedElements?.length || 0
      });
      
      // Return the matching results
      return NextResponse.json(parsedResponse);
    } catch (error) {
      console.error('Error parsing GPT response:', error);
      return NextResponse.json(
        { error: 'Failed to parse matching response', rawResponse: gptResponse },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in GPT element matching:', error);
    return NextResponse.json(
      { error: 'Failed to match elements' },
      { status: 500 }
    );
  }
} 