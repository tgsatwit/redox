# DynamoDB Setup Guide

This guide explains how to set up DynamoDB tables for the Document Processor application and apply the necessary IAM permissions.

## Prerequisites

- AWS CLI installed and configured with admin credentials
- Node.js and npm installed
- jq installed (for JSON processing)

## DynamoDB Tables

The Document Processor application uses the following DynamoDB tables:

1. `document-processor-config` - Stores application configuration
2. `document-processor-doctypes` - Stores document type definitions
3. `document-processor-subtypes` - Stores document sub-type definitions
4. `document-processor-elements` - Stores data element definitions
5. `document-processor-datasets` - Stores training datasets
6. `document-processor-examples` - Stores training examples
7. `document-classification-feedback` - Stores user feedback on document classification

## IAM Permissions

The IAM user needs the following permissions to work with these tables:

- `dynamodb:CreateTable`, `dynamodb:DescribeTable`, `dynamodb:ListTables` - For table management
- `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem` - For item operations
- `dynamodb:Query`, `dynamodb:Scan` - For querying and scanning tables
- `dynamodb:BatchGetItem`, `dynamodb:BatchWriteItem` - For batch operations

## Setup Instructions

### 1. Update Environment Variables

Ensure your `.env.local` file includes all the DynamoDB table names:

```
# DynamoDB Configuration
DYNAMODB_CLASSIFICATION_FEEDBACK_TABLE=document-classification-feedback
DYNAMODB_CONFIG_TABLE=document-processor-config
DYNAMODB_DOCTYPE_TABLE=document-processor-doctypes
DYNAMODB_SUBTYPE_TABLE=document-processor-subtypes
DYNAMODB_ELEMENT_TABLE=document-processor-elements
DYNAMODB_DATASET_TABLE=document-processor-datasets
DYNAMODB_EXAMPLE_TABLE=document-processor-examples
```

### 2. Apply IAM Policy

Run the provided script to create and apply the IAM policy:

```bash
cd scripts
./apply-dynamodb-policy.sh
```

This script will:
1. Create the IAM policy if it doesn't exist
2. Attach the policy to the IAM user
3. Set up the DynamoDB tables

### 3. Verify Setup

To verify that the setup was successful, restart your application and check that it can access the DynamoDB tables without permission errors.

## Local Development with DynamoDB Local

For local development, you can use DynamoDB Local:

1. Uncomment the `DYNAMODB_LOCAL_ENDPOINT` line in your `.env.local` file:

```
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000
```

2. Start DynamoDB Local using Docker:

```bash
docker-compose up -d dynamodb-local
```

3. Set up the tables for local development:

```bash
cd scripts
node setup-dynamodb-tables.js
```

## Troubleshooting

### Permission Errors

If you encounter permission errors like:

```
AccessDeniedException: User: arn:aws:iam::ACCOUNT_ID:user/USER_NAME is not authorized to perform: dynamodb:GetItem on resource: TABLE_ARN
```

Make sure:
1. The IAM policy has been correctly applied to the user
2. The policy includes all the necessary permissions for all tables
3. The table ARNs in the policy match your actual table ARNs

### Table Creation Errors

If table creation fails, check:
1. The AWS credentials have sufficient permissions to create tables
2. The tables don't already exist (the script should handle this)
3. The AWS region in your environment variables matches the region where you want to create the tables 