const sharp = require('sharp');

// Create a more realistic image with text
const width = 800;
const height = 1000;

// Create an SVG with more text content
const svgText = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="50" y="100" font-family="Arial" font-size="24" fill="black">INVOICE #12345</text>
  <text x="50" y="150" font-family="Arial" font-size="16" fill="black">Date: January 15, 2025</text>
  <text x="50" y="190" font-family="Arial" font-size="18" fill="black">BILL TO:</text>
  <text x="50" y="220" font-family="Arial" font-size="16" fill="black">John Smith</text>
  <text x="50" y="250" font-family="Arial" font-size="16" fill="black">123 Main Street</text>
  <text x="50" y="280" font-family="Arial" font-size="16" fill="black">Anytown, CA 94043</text>
  
  <text x="50" y="350" font-family="Arial" font-size="18" fill="black">DESCRIPTION</text>
  <text x="400" y="350" font-family="Arial" font-size="18" fill="black">AMOUNT</text>
  
  <line x1="50" y1="370" x2="750" y2="370" stroke="black" stroke-width="1"/>
  
  <text x="50" y="400" font-family="Arial" font-size="16" fill="black">Professional Services</text>
  <text x="400" y="400" font-family="Arial" font-size="16" fill="black">$1,200.00</text>
  
  <text x="50" y="430" font-family="Arial" font-size="16" fill="black">Software License</text>
  <text x="400" y="430" font-family="Arial" font-size="16" fill="black">$800.00</text>
  
  <text x="50" y="460" font-family="Arial" font-size="16" fill="black">Support and Maintenance</text>
  <text x="400" y="460" font-family="Arial" font-size="16" fill="black">$350.00</text>
  
  <line x1="50" y1="500" x2="750" y2="500" stroke="black" stroke-width="1"/>
  
  <text x="300" y="530" font-family="Arial" font-size="18" fill="black">TOTAL:</text>
  <text x="400" y="530" font-family="Arial" font-size="18" fill="black">$2,350.00</text>
  
  <text x="50" y="600" font-family="Arial" font-size="14" fill="black">Thank you for your business!</text>
  <text x="50" y="630" font-family="Arial" font-size="14" fill="black">Terms: Net 30 days</text>
</svg>
`;

sharp({
  create: {
    width,
    height,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }
})
  .composite([{
    input: Buffer.from(svgText),
    gravity: 'center'
  }])
  .png()
  .toFile('test-invoice.png')
  .then(() => {
    console.log('Test invoice image created successfully');
  })
  .catch(err => {
    console.error('Error creating test image:', err);
  }); 