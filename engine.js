const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const { scoreAsset } = require('./services/scoring');
const { createLinkedInCollage, createInstagramReel, generateCopy } = require('./services/transformer');
const { generateCaseStudy } = require('./services/documenter');

const INPUT_DIR = './input';
const LOW_CONF_DIR = './low-confidence';
const OUTPUT_DIR = './output';
const PROCESSED_DIR = './processed';
const LOG_FILE = './rationale.json';

// Ensure directories exist
fs.ensureDirSync(INPUT_DIR);
fs.ensureDirSync(LOW_CONF_DIR);
fs.ensureDirSync(OUTPUT_DIR);
fs.ensureDirSync(PROCESSED_DIR);

console.log('🚀 Content & Design Engine is running...');
console.log(`📡 Monitoring: ${INPUT_DIR}`);

const watcher = chokidar.watch(INPUT_DIR, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
    }
});

let assetLog = [];
if (fs.existsSync(LOG_FILE)) {
    try {
        assetLog = fs.readJsonSync(LOG_FILE);
    } catch (e) {
        assetLog = [];
    }
}

let pipelineTimer = null;
let isProcessing = false;

watcher.on('add', async (filePath) => {
    console.log(`\n📄 New asset detected: ${path.basename(filePath)}`);
    
    try {
        const evaluation = await scoreAsset(filePath);
        const logEntry = {
            timestamp: new Date().toISOString(),
            file: path.basename(filePath),
            ...evaluation
        };
        assetLog.push(logEntry);
        await fs.writeJson(LOG_FILE, assetLog, { spaces: 2 });

        if (evaluation.isLowConfidence) {
            console.log(`⚠️ Low confidence detected. Moving to ${LOW_CONF_DIR}`);
            const dest = path.join(LOW_CONF_DIR, path.basename(filePath));
            await fs.move(filePath, dest, { overwrite: true });
        } else {
            console.log(`✅ Quality approved. Queuing transformation...`);
            
            // Debounce pipeline to handle batches
            if (pipelineTimer) clearTimeout(pipelineTimer);
            
            pipelineTimer = setTimeout(async () => {
                if (isProcessing) {
                    console.log('⏳ Pipeline already running. Re-queuing...');
                    return; // The existing process will handle current files or a new timer will be set
                }
                
                isProcessing = true;
                try {
                    await triggerPipeline();
                } finally {
                    isProcessing = false;
                    pipelineTimer = null;
                }
            }, 2500); // Increased buffer to 2.5s
        }
    } catch (err) {
        console.error(`❌ Error processing asset: ${err.message}`);
    }
});

async function triggerPipeline() {
    const assets = await fs.readdir(INPUT_DIR);
    const validAssets = assets.map(a => path.join(INPUT_DIR, a));
    
    if (validAssets.length < 1) return;

    console.log('🛠️ Transforming assets...');

    // 1. LinkedIn Collage
    const images = validAssets.filter(a => /\.(jpg|jpeg|png)$/i.test(a));
    if (images.length >= 4) {
        const linkedinPath = path.join(OUTPUT_DIR, `LinkedIn_Post_${Date.now()}.png`);
        await createLinkedInCollage(images.slice(0, 6), linkedinPath);
        const copy = await generateCopy('linkedin', images.length);
        await fs.writeFile(linkedinPath.replace('.png', '.txt'), copy);
        console.log('✨ LinkedIn Post generated.');
    }

    // 2. Case Study
    const csPath = path.join(OUTPUT_DIR, `CaseStudy_${Date.now()}.md`);
    await generateCaseStudy(assetLog, './template.md', csPath);
    console.log('📝 Case Study updated.');

    // 3. Move processed assets
    for (const assetPath of validAssets) {
        try {
            const dest = path.join(PROCESSED_DIR, path.basename(assetPath));
            await fs.move(assetPath, dest, { overwrite: true });
        } catch (e) {
            console.error(`⚠️ Could not move ${assetPath} to processed: ${e.message}`);
        }
    }
}
