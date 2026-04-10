/**
 * extract-ui.js – Extract CSS, HTML, and JS from dashboard.ts into separate files.
 * One-time migration script.
 */
const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, 'ha-claw', 'src', 'web', 'dashboard.ts');
const uiDir = path.join(__dirname, 'ha-claw', 'src', 'web', 'ui');

// Read the dashboard.ts
const content = fs.readFileSync(dashboardPath, 'utf-8');
const lines = content.split('\n');

// Create ui/ directory
fs.mkdirSync(uiDir, { recursive: true });

// ── Extract CSS (between <style> and </style>) ──
const styleStart = lines.findIndex(l => l.includes('<style>'));
const styleEnd = lines.findIndex(l => l.includes('</style>'));
if (styleStart === -1 || styleEnd === -1) {
  console.error('Could not find <style> boundaries');
  process.exit(1);
}
// CSS content is lines after <style> and before </style>
const cssLines = lines.slice(styleStart + 1, styleEnd);
const cssContent = cssLines.join('\n').replace(/\r/g, '');
fs.writeFileSync(path.join(uiDir, 'style.css'), cssContent, 'utf-8');
console.log(`✅ style.css: ${cssLines.length} lines extracted`);

// ── Extract JS (between <script> and </script>) ──
// Find the LAST <script> (the main one, not the leaflet CDN)
let scriptStart = -1;
let scriptEnd = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('</script>') && scriptEnd === -1) scriptEnd = i;
  if (lines[i].includes('<script>') && scriptEnd !== -1 && scriptStart === -1) scriptStart = i;
}
if (scriptStart === -1 || scriptEnd === -1) {
  console.error('Could not find <script> boundaries');
  process.exit(1);
}
// JS content: skip the first line (const base='${basePath}') - that's a template variable
const jsLines = lines.slice(scriptStart + 1, scriptEnd);
// The first line is: const base='${basePath}';
// We replace it with a placeholder that the bundle script will handle
let jsContent = jsLines.join('\n').replace(/\r/g, '');
// Replace the template literal ${basePath} with a placeholder
jsContent = jsContent.replace("const base='${basePath}';", "const base='__BASEPATH__';");
fs.writeFileSync(path.join(uiDir, 'client.js'), jsContent, 'utf-8');
console.log(`✅ client.js: ${jsLines.length} lines extracted`);

// ── Extract HTML ──
// HTML = head (before <style>) + placeholder for CSS + </head> to <body>...</body> content (before <script>) + placeholder for JS
// Head part: from <!DOCTYPE> to the line with <style> (exclusive)
const doctypeIndex = lines.findIndex(l => l.includes('<!DOCTYPE'));
const headLines = lines.slice(doctypeIndex, styleStart); // up to but not including <style>

// Body part: from </style></head> through body content up to but not including <script>
const bodyLines = lines.slice(styleEnd + 1, scriptStart); // from </head> to <script>

// Closing: </script></body></html>
// We don't need the TS wrapper parts

let htmlContent = '';
// Add head lines
htmlContent += headLines.join('\n') + '\n';
// Add style placeholder
htmlContent += '<style>\n/* __INLINE_CSS__ */\n</style>\n';
// Add body content
htmlContent += bodyLines.join('\n') + '\n';
// Add script placeholder
htmlContent += '<script>\n/* __INLINE_JS__ */\n</script>\n';
// Add closing
htmlContent += '</body>\n</html>\n';

// Clean up: remove \r, remove leading TS template artifacts
htmlContent = htmlContent.replace(/\r/g, '');

fs.writeFileSync(path.join(uiDir, 'dashboard.html'), htmlContent, 'utf-8');

const htmlLineCount = htmlContent.split('\n').length;
console.log(`✅ dashboard.html: ${htmlLineCount} lines extracted`);

console.log('\n📁 Files created in:', uiDir);
