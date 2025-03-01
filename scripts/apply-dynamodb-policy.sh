#!/bin/bash

# Script to apply DynamoDB policy to the IAM user

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if jq is installed (for JSON processing)
if ! command -v jq &> /dev/null; then
    echo "jq is not installed. Please install it first."
    exit 1
fi

# Set variables
IAM_USER="extract-redact"
POLICY_NAME="DocumentProcessorDynamoDBPolicy"
POLICY_DOCUMENT="../document-processor-dynamodb-policy.json"

# Check if policy document exists
if [ ! -f "$POLICY_DOCUMENT" ]; then
    echo "Policy document not found at $POLICY_DOCUMENT"
    exit 1
fi

echo "Creating IAM policy $POLICY_NAME..."

# Create the policy
POLICY_ARN=$(aws iam create-policy \
    --policy-name $POLICY_NAME \
    --policy-document file://$POLICY_DOCUMENT \
    --query 'Policy.Arn' \
    --output text)

if [ $? -ne 0 ]; then
    echo "Failed to create policy. Check if it already exists."
    
    # Try to get the policy ARN if it already exists
    POLICY_ARN=$(aws iam list-policies \
        --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" \
        --output text)
    
    if [ -z "$POLICY_ARN" ]; then
        echo "Could not find existing policy. Exiting."
        exit 1
    else
        echo "Found existing policy: $POLICY_ARN"
    fi
else
    echo "Policy created successfully: $POLICY_ARN"
fi

echo "Attaching policy to IAM user $IAM_USER..."

# Attach the policy to the user
aws iam attach-user-policy \
    --user-name $IAM_USER \
    --policy-arn $POLICY_ARN

if [ $? -eq 0 ]; then
    echo "Policy attached successfully to user $IAM_USER"
else
    echo "Failed to attach policy to user. Check if the user exists."
    exit 1
fi

echo "Setting up DynamoDB tables..."

# Run the setup-dynamodb-tables.js script
node setup-dynamodb-tables.js

if [ $? -eq 0 ]; then
    echo "DynamoDB tables set up successfully"
else
    echo "Failed to set up DynamoDB tables"
    exit 1
fi

echo "Done! The IAM user $IAM_USER now has the necessary permissions to use DynamoDB tables." 