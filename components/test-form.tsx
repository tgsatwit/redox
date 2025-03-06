"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function TestForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: "Test Policy",
    description: "Test Description",
    duration: 365
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Test form submission started")
    
    setIsLoading(true)
    try {
      // Test POST request
      console.log('Sending test POST request with payload:', formData)
      
      const response = await fetch('/api/retention-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      console.log('POST response status:', response.status)
      const responseData = await response.json()
      console.log('POST response data:', responseData)
      
      setResult({
        status: response.status,
        data: responseData
      })
    } catch (error) {
      console.error('Error in test form:', error)
      setResult({
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Test API Form</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (days)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                disabled={isLoading}
              />
            </div>
            
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Submitting...' : 'Submit Test Form'}
            </Button>
          </form>
          
          {result && (
            <div className="mt-6 p-4 border rounded">
              <h3 className="font-medium">API Response:</h3>
              <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 