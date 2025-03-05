"use client"

import { ConfigLayout } from "./config/config-layout"
import { DocumentConfigManager } from "./config/document-config-manager"

export default function DocumentConfig() {
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Configuration</h1>
            <p className="text-muted-foreground">
              Configure document types, data elements, and retention policies.
            </p>
          </div>
        </div>

        <ConfigLayout />
      </div>
    </div>
  )
}

// Re-export the DocumentConfigManager component to make it available to importers
export { DocumentConfigManager } 