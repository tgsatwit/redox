import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { DynamoDBConfigService } from '@/lib/services/dynamodb-config-service';
import { Prompt } from '@/lib/types';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Default prompts to use if none found in database
const DEFAULT_SYSTEM_PROMPT = "You are an AI assistant specialized in identifying Tax File Numbers (TFNs) in document text. A TFN is a unique 9-digit identifier issued by the Australian Taxation Office.";
const DEFAULT_USER_PROMPT = `Analyze the following document text and determine if it contains any Tax File Numbers (TFNs).
A valid TFN is a 9-digit number that may be formatted with spaces or without spaces.

Document Text:
{document_text}

Does this document contain any TFNs? Reply with only "Yes" or "No".`;

// TFN Identification prompt IDs from the database
const TFN_SYSTEM_PROMPT_ID = "vnor847a1xjxcbyyuanv3ftj";
const TFN_USER_PROMPT_ID = "zvxf72zr7qo8jr5xm07mha68";

// Table name
const PROMPTS_TABLE = process.env.DYNAMODB_PROMPTS_TABLE || 'document-processor-prompts';

// Function to get a prompt by ID
async function getPromptById(promptId: string): Promise<Prompt | null> {
  try {
    const response = await docClient.send(
      new GetCommand({
        TableName: PROMPTS_TABLE,
        Key: { id: promptId }
      })
    );
    
    return response.Item as Prompt || null;
  } catch (error) {
    console.error(`Error fetching prompt ${promptId}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Missing text content for TFN scanning' },
        { status: 400 }
      );
    }

    // Get the TFN identification prompts from DynamoDB
    let systemContent = DEFAULT_SYSTEM_PROMPT;
    let userContent = DEFAULT_USER_PROMPT.replace('{document_text}', 
      `${text.substring(0, 8000)}${text.length > 8000 ? '...[truncated]' : ''}`);
    
    try {
      // Fetch the system prompt by ID
      console.log(`Fetching system prompt with ID: ${TFN_SYSTEM_PROMPT_ID}`);
      const systemPrompt = await getPromptById(TFN_SYSTEM_PROMPT_ID);
      
      // Fetch the user prompt by ID
      console.log(`Fetching user prompt with ID: ${TFN_USER_PROMPT_ID}`);
      const userPrompt = await getPromptById(TFN_USER_PROMPT_ID);
      
      // Use system prompt if found
      if (systemPrompt) {
        systemContent = systemPrompt.content;
        console.log(`Using system prompt from database: ${systemPrompt.id}`);
      } else {
        console.log("System prompt not found in database, using default");
      }
      
      // Use user prompt if found
      if (userPrompt) {
        // Check if the prompt contains {document_text} placeholder
        if (userPrompt.content.includes('{document_text}')) {
          userContent = userPrompt.content.replace('{document_text}', 
            `${text.substring(0, 8000)}${text.length > 8000 ? '...[truncated]' : ''}`);
        } else {
          // If no placeholder, append the text to the prompt
          userContent = `${userPrompt.content}
          
Document Text:
${text.substring(0, 8000)}${text.length > 8000 ? '...[truncated]' : ''}`;
        }
        console.log(`Using user prompt from database: ${userPrompt.id}`);
      } else {
        console.log("User prompt not found in database, using default");
      }
    } catch (error) {
      console.warn('Error fetching TFN prompts from database, using defaults:', error);
      // Continue with default prompts
    }

    // Call GPT-4o for TFN identification
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent }
      ],
      temperature: 0.1, // Low temperature for more deterministic results
    });
    
    // Get the GPT response
    const gptResponse = completion.choices[0]?.message?.content?.trim() || '';
    
    // Determine if a TFN was identified (check for "Yes" in the response)
    const tfnIdentified = gptResponse.toLowerCase().includes('yes');
    
    // Return the TFN scan result
    return NextResponse.json({
      tfnIdentified,
      rawResponse: gptResponse
    });
  } catch (error) {
    console.error('Error in TFN scanning:', error);
    return NextResponse.json(
      { error: 'Failed to scan for TFN', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 