"use client"

import { DocumentConfigManager } from "./config"

export default function DocumentConfig() {
  return <DocumentConfigManager />
}

// Re-export the DocumentConfigManager component to make it available to importers
export { DocumentConfigManager } 