const fs = require('fs');
const path = require('path');
const modelsDir = path.join('src', 'repositories', 'mongodb', 'models');
const files = fs.readdirSync(modelsDir);

files.forEach(file => {
  const filePath = path.join(modelsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace userId ObjectId with String
  const newContent = content.replace(/userId:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId,\s*ref:\s*'User'/g, 
    "userId: {\n    type: String,\n    ref: 'User'");
    
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log('Updated', file);
  }
});
