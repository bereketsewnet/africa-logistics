const fs = require('fs');
const content = fs.readFileSync('src/context/LanguageContext.tsx', 'utf8');

function extractKeys(lang) {
  const regex = new RegExp(`^\\s*${lang}:\\s*\\{([\\s\\S]*?)^\\s*\\},?$`, 'm');
  const match = content.match(regex);
  if (!match) return [];
  const block = match[1];
  const keys = [];
  const lineRegex = /^\s*([a-zA-Z0-9_]+)\s*:/gm;
  let m;
  while ((m = lineRegex.exec(block)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

const enKeys = extractKeys('en');
const omKeys = extractKeys('om');
const amKeys = extractKeys('am');

console.log(`EN keys: ${enKeys.length}`);
console.log(`OM keys: ${omKeys.length}`);
console.log(`AM keys: ${amKeys.length}`);

const missingInOm = enKeys.filter(k => !omKeys.includes(k));
console.log(`Missing in OM: ${missingInOm.length}`);
