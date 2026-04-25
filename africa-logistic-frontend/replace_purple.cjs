const fs = require('fs');
const path = require('path');

const OLD_PURPLE = /#7c3aed/gi;
const OLD_INDIGO = /#4f46e5/gi;
// We will replace purple with a darker forest green to complement the #61941f green base
// and replace indigo with a slightly different shade of very dark green

const NEW_DARK_GREEN = '#3e6113'; 
const NEW_FOREST_GREEN = '#283e0c';

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css') || fullPath.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      content = content.replace(OLD_PURPLE, NEW_DARK_GREEN);
      content = content.replace(OLD_INDIGO, NEW_FOREST_GREEN);

      fs.writeFileSync(fullPath, content, 'utf-8');
    }
  }
}

walkDir('src');
console.log("Purple gradient colors updated successfully.");
