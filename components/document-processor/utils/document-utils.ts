import { AnyBoundingBox, AwsBoundingBox, ExtendedRedactionElement } from '../types';
import type { DataElementConfig } from '@/lib/types';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import * as pdfjsLib from 'pdfjs-dist';

export const isAwsBoundingBox = (box: AnyBoundingBox): box is AwsBoundingBox => {
  return 'Left' in box && 'Top' in box && 'Width' in box && 'Height' in box;
};

export const getBoundingBoxValues = (box: AnyBoundingBox) => {
  if (isAwsBoundingBox(box)) {
    return {
      left: box.Left,
      top: box.Top,
      width: box.Width,
      height: box.Height
    };
  }
  
  return {
    left: box.x || 0,
    top: box.y || 0,
    width: box.width || 0,
    height: box.height || 0
  };
};

export const getElementCategory = (element: ExtendedRedactionElement, activeDocType: any): string => {
  if (!activeDocType) return 'Unknown';
  
  // Try to find the element in the document type configuration
  const configuredElement = activeDocType.dataElements.find(
    (de: DataElementConfig) => de.name === element.label
  );
  
  if (configuredElement) {
    return configuredElement.category || 'General';
  }
  
  // Check sub-types if they exist
  if (activeDocType.subTypes) {
    for (const subType of activeDocType.subTypes) {
      const subTypeElement = subType.dataElements.find(
        (de: DataElementConfig) => de.name === element.label
      );
      if (subTypeElement) {
        return subTypeElement.category || 'General';
      }
    }
  }
  
  return 'Unknown';
};

export const convertBase64ToFile = (base64Data: string, filename: string, mimeType: string): File => {
  const byteCharacters = atob(base64Data);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
    const slice = byteCharacters.slice(offset, offset + 1024);
    const byteNumbers = new Array(slice.length);
    
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  const blob = new Blob(byteArrays, { type: mimeType });
  return new File([blob], filename, { type: mimeType });
};

export const getPdfPageCount = async (pdfFile: File): Promise<number> => {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return pdfDoc.numPages;
  } catch (error) {
    console.error('Error getting PDF page count:', error);
    throw error;
  }
};

export const findMatchingElement = (extractedLabel: string, configuredElements: DataElementConfig[]): DataElementConfig | null => {
  // First try exact match
  const exactMatch = configuredElements.find(element => 
    element.name.toLowerCase() === extractedLabel.toLowerCase()
  );
  
  if (exactMatch) return exactMatch;
  
  // Then try partial match
  const partialMatch = configuredElements.find(element => 
    extractedLabel.toLowerCase().includes(element.name.toLowerCase())
  );
  
  if (partialMatch) return partialMatch;
  
  // Finally try fuzzy match
  const fuzzyMatch = configuredElements.find(element => {
    const elementWords = element.name.toLowerCase().split(/\s+/);
    const labelWords = extractedLabel.toLowerCase().split(/\s+/);
    
    return elementWords.some((word: string) => 
      labelWords.some((labelWord: string) => 
        labelWord.includes(word) || word.includes(labelWord)
      )
    );
  });
  
  return fuzzyMatch || null;
}; 