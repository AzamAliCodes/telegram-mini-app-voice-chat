/* global process */
import fs from 'fs';
import path from 'path';

const backendUrl = process.env.VITE_BACKEND_URL || 'https://asdvffegrhgfh-vcbot-backend.hf.space';

const content = `# Proxy API requests to HF Spaces backend (same-origin for mobile WebView)
/api/*  ${backendUrl.replace(/\/$/, '')}/api/:splat  200!

# SPA catch-all (must be last)
/*  /index.html  200
`;

fs.writeFileSync(path.join('dist', '_redirects'), content);
console.log('✅ Generated production _redirects with backend:', backendUrl);
