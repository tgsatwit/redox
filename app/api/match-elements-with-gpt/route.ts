import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';

// Define interfaces for type-safety
interface DataElementConfig {
  id: string;
  name: string;
  description?: string;
  category?: string;
  action?: string;
  type?: string;
}

// Define bounding box types
interface AwsBoundingBox {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
}

interface StandardBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type AnyBoundingBox = AwsBoundingBox | StandardBoundingBox;

interface ExtractedElement {
  id: string;
  label?: string;
  text?: string;
  type?: string;
  category?: string;
  value?: string | null;
  boundingBox?: AnyBoundingBox;
  keyBoundingBox?: AnyBoundingBox;
  pageIndex?: number;
}

// Define the response interface for element matching
interface ElementMatch {
  extractedElementId: string;
  configuredElementId: string;
  confidence: number;
  reasoning: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize config service
const configService = new DynamoDBConfigService();

export async function POST(request: NextRequest) {
  try {
    const { 
      extractedElements, 
      configuredElements, 
      documentTypeId, 
      documentSubTypeId 
    } = await request.json();

    if (!extractedElements || !Array.isArray(extractedElements)) {
      return NextResponse.json(
        { error: 'Missing or invalid extractedElements' },
        { status: 400 }
      );
    }

    // Get the appropriate data elements based on document type/subtype
    let dataElementsToUse: DataElementConfig[] = [];
    
    if (configuredElements && Array.isArray(configuredElements)) {
      // If configuredElements are provided directly, use them
      dataElementsToUse = configuredElements;
    } else if (documentSubTypeId && documentTypeId) {
      try {
        // If we have both a document type and subtype, fetch elements for the subtype
        console.log(`Fetching data elements for subtype: ${documentSubTypeId}`);
        const subTypeElements = await configService.getDataElementsBySubType(documentSubTypeId);
        if (subTypeElements && subTypeElements.length > 0) {
          dataElementsToUse = subTypeElements;
          console.log(`Found ${dataElementsToUse.length} data elements for subtype`);
        } else {
          // Fallback to document type if no subtype elements
          console.log(`No elements found for subtype, falling back to document type`);
          const docTypeElements = await configService.getDataElementsByDocumentType(documentTypeId);
          dataElementsToUse = docTypeElements || [];
          console.log(`Found ${dataElementsToUse.length} data elements for document type fallback`);
        }
      } catch (error) {
        console.error('Error fetching subtype data elements:', error);
      }
    } else if (documentTypeId) {
      try {
        // If we have a documentTypeId but no subTypeId, fetch elements for the document type
        console.log(`Fetching data elements for document type: ${documentTypeId}`);
        const docTypeElements = await configService.getDataElementsByDocumentType(documentTypeId);
        dataElementsToUse = docTypeElements || [];
        console.log(`Found ${dataElementsToUse.length} data elements for document type`);
      } catch (error) {
        console.error('Error fetching document type data elements:', error);
      }
    } else if (!configuredElements || !Array.isArray(configuredElements)) {
      return NextResponse.json(
        { error: 'Missing or invalid configuredElements and no document type/subtype IDs provided' },
        { status: 400 }
      );
    }

    // Ensure we have data elements to work with
    if (dataElementsToUse.length === 0) {
      if (configuredElements && Array.isArray(configuredElements)) {
        dataElementsToUse = configuredElements;
      } else {
        return NextResponse.json(
          { error: 'No data elements found for the specified document type/subtype' },
          { status: 400 }
        );
      }
    }

    // Prepare the configured elements information for the prompt
    const configElementsInfo = dataElementsToUse.map((element: DataElementConfig) => 
      `- ID: ${element.id}, Name: "${element.name}"${element.description ? `, Description: "${element.description}"` : ''}${element.category ? `, Category: "${element.category}"` : ''}${element.action ? `, Action: "${element.action}"` : ''}`
    ).join('\n');

    // Prepare the extracted elements information for the prompt with more details
    const extractedElementsInfo = extractedElements.map((element: ExtractedElement) => {
      const label = element.label || 'Unknown';
      const text = element.text || element.value || 'Not available';
      const type = element.type || 'Unknown';
      
      return `- ID: ${element.id}, Label: "${label}", Text: "${text}", Type: "${type}"`;
    }).join('\n');

    // Create a prompt specifically focused on label matching only
    const prompt = `As a document data extraction expert, your task is to match the labels of extracted elements with the names of configured data elements.

Configured Data Elements (what we expect to find in this document type):
${configElementsInfo}

Extracted Elements (what was actually found in this document):
${extractedElementsInfo}

MATCHING INSTRUCTIONS:
1. Focus ONLY on matching the LABEL of each extracted element with the NAME of a configured element.
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
4. Be cautious about field labels vs. actual values:
   - Some extracted "text" fields might just be translations/labels without actual values
   - If an extracted element contains text like "/ Date de naissance", this is likely a label translation, not a value
   - Actual values for date fields should look like dates (e.g., "01/01/1990")
   - Names should look like actual person names, not field labels
5. Assign confidence scores (0-1) that reflect certainty of matches
6. Provide brief reasoning for each match to explain your decision

IMPORTANT: You are ONLY providing label matching information. You are NOT transforming or modifying the original data in any way.

Return ONLY the matches in this JSON format:
{
  "matches": [
    {
      "extractedElementId": "id of the extracted element",
      "configuredElementId": "id of the matching configured element",
      "confidence": <number between 0-1 indicating confidence level>,
      "reasoning": "Brief explanation of why this is a match"
    }
    // Repeat for each match you find
  ]
}`;

    // Call OpenAI to do the matching
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "You are a document data extraction expert. Your task is to match extracted data elements with configured data elements." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_tokens: 4096,
    });

    // Get the content from OpenAI's response
    const gptResponse = completion.choices[0]?.message?.content || "{}";
    
    try {
      const parsedResponse = JSON.parse(gptResponse);
      
      // Create a mapping from extracted element ID to matched config data
      const matchesById: Record<string, ElementMatch> = {};
      if (parsedResponse.matches && Array.isArray(parsedResponse.matches)) {
        parsedResponse.matches.forEach((match: ElementMatch) => {
          matchesById[match.extractedElementId] = match;
        });
      }
      
      // Add matching information to the original extracted elements WITHOUT modifying their structure
      const enhancedElements = extractedElements.map(element => {
        const match = matchesById[element.id];
        
        if (match) {
          // Get the corresponding configured element
          const configElement = dataElementsToUse.find(config => config.id === match.configuredElementId);
          
          // Simply add the matching info as new properties, preserving ALL original properties
          return {
            ...element, // Keep the element exactly as it was
            // Add matching information as new properties
            matchedConfigId: match.configuredElementId,
            matchConfidence: match.confidence,
            matchReasoning: match.reasoning,
            matchedConfigName: configElement?.name,
            matchedConfigCategory: configElement?.category,
            matchedConfigAction: configElement?.action,
            matchedConfigType: configElement?.type
          };
        }
        
        // If no match, return the original element unchanged
        return element;
      });
      
      // Log the matching results for debugging
      console.log("Matching results:", {
        totalExtractedElements: extractedElements.length,
        matchedElements: parsedResponse.matches?.length || 0,
        dataElementsUsed: dataElementsToUse.length
      });
      
      // Return the original elements with matching info added + the raw matches
      return NextResponse.json({
        elements: enhancedElements, // Original elements with matching info added
        matches: parsedResponse.matches || [],
        configuredElements: dataElementsToUse, // Send back the configured elements for reference
        stats: {
          total: extractedElements.length,
          matched: parsedResponse.matches?.length || 0
        }
      });
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