#!/bin/bash

# Script to start local DynamoDB and set up tables for local development

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install it first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose is not installed. Please install it first."
    exit 1
fi

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# Update .env.local to use local DynamoDB
if grep -q "^# DYNAMODB_LOCAL_ENDPOINT" .env.local; then
    echo "Enabling local DynamoDB endpoint in .env.local..."
    sed -i '' 's/^# DYNAMODB_LOCAL_ENDPOINT/DYNAMODB_LOCAL_ENDPOINT/' .env.local
fi

# Start DynamoDB Local using Docker
echo "Starting DynamoDB Local..."
docker-compose up -d dynamodb-local

# Wait for DynamoDB to start
echo "Waiting for DynamoDB to start..."
sleep 5

# Set up the tables for local development
echo "Setting up DynamoDB tables..."
cd scripts
node setup-dynamodb-tables.js

if [ $? -eq 0 ]; then
    echo "DynamoDB tables set up successfully"
else
    echo "Failed to set up DynamoDB tables"
    exit 1
fi

echo "Local DynamoDB is running at http://localhost:8000"
echo "You can use the AWS DynamoDB console to view and manage your tables:"
echo "https://ap-southeast-2.console.aws.amazon.com/dynamodbv2/home?region=ap-southeast-2#tables"
echo ""
echo "To stop DynamoDB Local, run: docker-compose down" 