const fs = require('fs');
const path = require('path');

const OLD_HEX_CYAN = /#00e5ff/gi;
const OLD_HEX_BLUE = /#0284c7/gi;
const OLD_HEX_SKY = /#0ea5e9/gi;
const OLD_RGB_CYAN1 = /0,\s*229,\s*255/g;
const OLD_RGB_CYAN2 = /0,229,255/g;

const NEW_HEX = '#61941f';
const NEW_RGB = '97, 148, 31';
const NEW_RGB_COMPACT = '97,148,31';

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.css') || fullPath.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      content = content.replace(OLD_HEX_CYAN, NEW_HEX);
      content = content.replace(OLD_HEX_BLUE, NEW_HEX);
      content = content.replace(OLD_HEX_SKY, '#71ad25'); // A slightly lighter green for gradients
      content = content.replace(OLD_RGB_CYAN1, NEW_RGB);
      content = content.replace(OLD_RGB_CYAN2, NEW_RGB_COMPACT);

      fs.writeFileSync(fullPath, content, 'utf-8');
    }
  }
}

walkDir('src');
walkDir('public');
if(fs.existsSync('index.html')) {
    let htmlContent = fs.readFileSync('index.html', 'utf-8');
    htmlContent = htmlContent.replace(OLD_HEX_CYAN, NEW_HEX)
                               .replace(OLD_HEX_BLUE, NEW_HEX)
                               .replace(OLD_HEX_SKY, '#71ad25')
                               .replace(OLD_RGB_CYAN1, NEW_RGB)
                               .replace(OLD_RGB_CYAN2, NEW_RGB_COMPACT);
    fs.writeFileSync('index.html', htmlContent, 'utf-8');
}
console.log("Theme colors updated successfully.");
