/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // PDF.js uses the 'canvas' module on the server side but doesn't need it in the browser
    if (isServer) {
      // When running on the server, we don't need canvas
      config.externals.push({
        canvas: 'commonjs canvas',
        'pdfjs-dist': 'commonjs pdfjs-dist',
      })
    }

    // Prevent loading PDF.js worker on server-side
    if (!isServer) {
      // This is a fix for PDF.js worker in next.js
      config.resolve.alias.canvas = false
    }

    return config
  },
  // Disable server-side rendering for pages that use PDF.js
  // This ensures that PDF.js is only loaded on the client
  experimental: {
    esmExternals: 'loose', // Required for PDF.js to work properly
  },
}

module.exports = nextConfig 