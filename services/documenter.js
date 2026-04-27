const fs = require('fs-extra');
const path = require('path');

async function generateCaseStudy(assets, templatePath, outputPath) {
    let template = await fs.readFile(templatePath, 'utf8');
    
    const assetRows = assets.map(a => 
        `| ${a.file || 'N/A'} | ${a.type || 'Image'} | ${a.score} | ${a.rationale} |`
    ).join('\n');

    const result = template
        .replace('{{asset_id}}', 'Batch_' + Date.now())
        .replace('{{type}}', 'Mixed Media')
        .replace('{{score}}', 'Auto-evaluated')
        .replace('{{rationale}}', 'Collated Pipeline')
        .replace('| {{asset_id}} | {{type}} | {{score}} | {{rationale}} |', assetRows);

    await fs.writeFile(outputPath, result);
}

module.exports = { generateCaseStudy };
