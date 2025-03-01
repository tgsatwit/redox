"use client"

import React from 'react'
import { Card } from './ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { AlertCircle } from 'lucide-react'

/**
 * A helper component that guides users through setting up AWS credentials
 * for the document processing features
 */
export function AwsCredentialsHelper() {
  return (
    <Card className="p-4 text-sm">
      <div className="flex items-start gap-2 mb-3 text-amber-600">
        <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-base">AWS Credentials Required</h3>
          <p className="mt-1">
            This operation requires properly configured AWS credentials. Follow the instructions below to set up your environment.
          </p>
        </div>
      </div>
      
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="env-setup">
          <AccordionTrigger>Environment Setup</AccordionTrigger>
          <AccordionContent>
            <p className="mb-2">
              Create a <code>.env.local</code> file in your project root with the following variables:
            </p>
            <pre className="bg-slate-100 p-2 rounded text-xs overflow-x-auto dark:bg-slate-800">
              {`AWS_REGION=your-region
              AWS_ACCESS_KEY_ID=your-access-key
              AWS_SECRET_ACCESS_KEY=your-secret-key
              AWS_S3_BUCKET=your-bucket-name
              AWS_TEXTRACT_ROLE_ARN=your-role-arn (optional)
              `}
            </pre>
          </AccordionContent>
        </AccordionItem>
        
        <AccordionItem value="iam-policy">
          <AccordionTrigger>Required IAM Permissions</AccordionTrigger>
          <AccordionContent>
            <p className="mb-2">Your AWS IAM user needs the following permissions:</p>
            <div className="space-y-2">
              <div className="p-2 bg-slate-100 rounded-md dark:bg-slate-800">
                <h4 className="font-semibold">Amazon Textract</h4>
                <ul className="list-disc pl-5 text-xs">
                  <li>textract:AnalyzeDocument</li>
                  <li>textract:DetectDocumentText</li>
                </ul>
              </div>
              
              <div className="p-2 bg-slate-100 rounded-md dark:bg-slate-800">
                <h4 className="font-semibold">Amazon S3</h4>
                <ul className="list-disc pl-5 text-xs">
                  <li>s3:PutObject</li>
                  <li>s3:GetObject</li>
                  <li>s3:DeleteObject</li>
                </ul>
              </div>
              
              <div className="p-2 bg-slate-100 rounded-md dark:bg-slate-800">
                <h4 className="font-semibold">Amazon Comprehend (For Classification)</h4>
                <ul className="list-disc pl-5 text-xs">
                  <li>comprehend:DetectDominantLanguage</li>
                  <li>comprehend:DetectEntities</li>
                  <li>comprehend:DetectSentiment</li>
                </ul>
              </div>
            </div>
            
            <p className="mt-3 text-xs">
              Example IAM policy JSON:
            </p>
            <pre className="bg-slate-100 p-2 rounded text-xs overflow-x-auto dark:bg-slate-800 mt-1">
              {`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeDocument",
        "textract:DetectDocumentText"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "comprehend:DetectDominantLanguage",
        "comprehend:DetectEntities",
        "comprehend:DetectSentiment"
      ],
      "Resource": "*"
    }
  ]
}`}
            </pre>
          </AccordionContent>
        </AccordionItem>
        
        <AccordionItem value="restart">
          <AccordionTrigger>After Setup</AccordionTrigger>
          <AccordionContent>
            <p>
              After setting up your environment variables and IAM permissions, restart your Next.js application for the changes to take effect.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
} 