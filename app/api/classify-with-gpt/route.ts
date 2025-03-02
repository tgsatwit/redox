import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Define interfaces for type-safety
interface SubType {
  id: string;
  name: string;
  description?: string;
}

interface DocumentType {
  id: string;
  name: string;
  description?: string;
  subTypes?: SubType[];
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text, availableTypes, fileName } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Missing text content for classification' },
        { status: 400 }
      );
    }

    if (!availableTypes || !Array.isArray(availableTypes)) {
      return NextResponse.json(
        { error: 'Missing or invalid availableTypes' },
        { status: 400 }
      );
    }

    // Prepare the available types information for the prompt
    const typesInfo = (availableTypes as DocumentType[]).map(type => {
      const subTypeInfo = type.subTypes?.length 
        ? `\nSub-types: ${type.subTypes.map((st: SubType) => 
            `- ${st.name}${st.description ? `: ${st.description}` : ''}`
          ).join('\n')}`
        : '';
      
      return `- ${type.name}${type.description ? `: ${type.description}` : ''}${subTypeInfo}`;
    }).join('\n');

    // Create a prompt for GPT
    const prompt = `As a document classification expert, analyze this document text and classify it.

Available Document Types:
${typesInfo}

Document Filename: ${fileName || 'Unknown'}

Document Text (truncated if long):
${text.substring(0, 8000)}${text.length > 8000 ? '...[truncated]' : ''}

Based on the text content and available document types, determine the most appropriate document type and sub-type (if applicable).

Return your analysis in JSON format:
{
  "documentType": "Most appropriate document type from the list above",
  "subType": "Most appropriate sub-type if relevant, otherwise null",
  "confidence": <number between 0-1 indicating confidence level>,
  "reasoning": "Brief explanation of your classification decision"
}`;

    // Call GPT-4o
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: "You are an AI specialized in document classification. You classify documents based on their text content into predefined categories. Always respond with valid JSON."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Lower temperature for more deterministic results
    });
    
    // Get the GPT response and parse the JSON
    const gptResponse = completion.choices[0]?.message?.content;
    
    if (!gptResponse) {
      return NextResponse.json(
        { error: 'No response from classification model' },
        { status: 500 }
      );
    }
    
    try {
      const parsedResponse = JSON.parse(gptResponse);
      
      // Return the classification results
      return NextResponse.json({
        documentType: parsedResponse.documentType,
        subType: parsedResponse.subType,
        confidence: parsedResponse.confidence,
        reasoning: parsedResponse.reasoning
      });
    } catch (error) {
      console.error('Error parsing GPT response:', error);
      return NextResponse.json(
        { error: 'Failed to parse classification response', rawResponse: gptResponse },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in GPT classification:', error);
    return NextResponse.json(
      { error: 'Failed to classify document' },
      { status: 500 }
    );
  }
} 