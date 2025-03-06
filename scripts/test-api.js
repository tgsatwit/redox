#!/usr/bin/env node

const fetch = require('node-fetch');

// Base URL - adjust if your app runs on a different port
const BASE_URL = 'http://localhost:3000';

// Test policy data
const testPolicy = {
  name: `Test Policy ${Date.now()}`,
  description: 'Created by test script',
  duration: 365 // 1 year in days
};

async function testRetentionPoliciesAPI() {
  console.log('===== Testing Retention Policies API =====');
  let createdPolicyId = null;
  
  try {
    // 1. Test GET - List all policies
    console.log('\n1. Testing GET - List all policies');
    const listResponse = await fetch(`${BASE_URL}/api/retention-policies`);
    const policies = await listResponse.json();
    console.log(`Status: ${listResponse.status}`);
    console.log(`Found ${policies.length} policies`);
    
    // 2. Test POST - Create a new policy
    console.log('\n2. Testing POST - Create a new policy');
    console.log('Request payload:', testPolicy);
    
    const createResponse = await fetch(`${BASE_URL}/api/retention-policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPolicy)
    });
    
    const newPolicy = await createResponse.json();
    console.log(`Status: ${createResponse.status}`);
    console.log('Response:', newPolicy);
    
    if (createResponse.ok && newPolicy.id) {
      createdPolicyId = newPolicy.id;
      console.log(`Successfully created policy with ID: ${createdPolicyId}`);
      
      // 3. Test PUT - Update the policy
      console.log('\n3. Testing PUT - Update the policy');
      const updateData = {
        id: createdPolicyId,
        name: `Updated Test Policy ${Date.now()}`,
        description: 'Updated by test script'
      };
      console.log('Update payload:', updateData);
      
      const updateResponse = await fetch(`${BASE_URL}/api/retention-policies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      const updateResult = await updateResponse.json();
      console.log(`Status: ${updateResponse.status}`);
      console.log('Response:', updateResult);
      
      // 4. Test DELETE - Delete the policy
      console.log('\n4. Testing DELETE - Delete the policy');
      const deleteData = { id: createdPolicyId };
      console.log('Delete payload:', deleteData);
      
      const deleteResponse = await fetch(`${BASE_URL}/api/retention-policies`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deleteData)
      });
      
      const deleteResult = await deleteResponse.json();
      console.log(`Status: ${deleteResponse.status}`);
      console.log('Response:', deleteResult);
    }
    
    // 5. Verify deletion by listing policies again
    console.log('\n5. Verifying deletion - List all policies again');
    const finalListResponse = await fetch(`${BASE_URL}/api/retention-policies`);
    const finalPolicies = await finalListResponse.json();
    console.log(`Status: ${finalListResponse.status}`);
    console.log(`Found ${finalPolicies.length} policies`);
    
    console.log('\n===== API Testing Complete =====');
  } catch (error) {
    console.error('Error during API testing:', error);
  }
}

// Run the tests
testRetentionPoliciesAPI().catch(console.error); 