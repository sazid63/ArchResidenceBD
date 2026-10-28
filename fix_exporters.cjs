const fs = require('fs');
const path = 'repo/src/cad/exporters.ts';
let content = fs.readFileSync(path, 'utf8');

// The broken string is across two lines in the array
content = content.replace(
  /'        print\("ifcopenshell is not installed; skipping the optional IFC export '\s*\n\s*'  \(the geometry above was built normally\)\."\)/,
  '        print("ifcopenshell is not installed; skipping the optional IFC export (the geometry above was built normally).")'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed');