process.on('uncaughtException', (err) => {
    console.error(`⚠️ Uncaught Exception caught gracefully: ${err.message}`);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');
const { scoreAsset } = require('./services/scoring');
const { createLinkedInCollage, createInstagramReel, generateCopy, applyLinkedInTemplate } = require('./services/transformer');
const { generateCaseStudy } = require('./services/documenter');
const config = require('./config');

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

// Always start with a clean log — run.js already clears rationale.json
// Starting fresh avoids a race condition where engine.js loads stale data
let assetLog = [];
fs.writeJsonSync(LOG_FILE, assetLog, { spaces: 2 });

let imagePipelineTimer = null;
let videoPipelineTimer = null;
let isImageProcessing = false;
let isVideoProcessing = false;

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

            const isVideo = /\.(mp4|mov)$/i.test(filePath);
            if (isVideo) {
                // Video Pipeline Debouncing
                if (videoPipelineTimer) clearTimeout(videoPipelineTimer);

                videoPipelineTimer = setTimeout(async () => {
                    if (isVideoProcessing) {
                        console.log('⏳ Video Pipeline already running. Re-queuing...');
                        return;
                    }

                    isVideoProcessing = true;
                    try {
                        await triggerVideoPipeline();
                    } finally {
                        isVideoProcessing = false;
                        videoPipelineTimer = null;
                    }
                }, 2500); // 2.5s buffer for videos
            } else {
                // Image Pipeline Debouncing
                if (imagePipelineTimer) clearTimeout(imagePipelineTimer);

                imagePipelineTimer = setTimeout(async () => {
                    if (isImageProcessing) {
                        console.log('⏳ Image Pipeline already running. Re-queuing...');
                        return;
                    }

                    isImageProcessing = true;
                    try {
                        await triggerImagePipeline();
                    } finally {
                        isImageProcessing = false;
                        imagePipelineTimer = null;
                    }
                }, 2500); // 2.5s buffer for images
            }
        }
    } catch (err) {
        console.error(`❌ Error processing asset: ${err.message}`);
    }
});

async function getValidAssets(extRegex) {
    const assets = await fs.readdir(INPUT_DIR);
    const valid = [];
    for (const a of assets) {
        if (!extRegex.test(a)) continue;
        const fullPath = path.join(INPUT_DIR, a);
        try {
            const stat = await fs.stat(fullPath);
            if (stat.size > 10240) { // > 10KB
                valid.push(fullPath);
            } else {
                console.warn(`⚠️ Skipping tiny/corrupted file (${stat.size} bytes): ${a}`);
                const dest = path.join(LOW_CONF_DIR, a);
                await fs.move(fullPath, dest, { overwrite: true });
            }
        } catch (e) {
            console.error(`⚠️ Could not stat ${a}: ${e.message}`);
        }
    }
    return valid;
}

async function triggerImagePipeline() {
    const images = await getValidAssets(/\.(jpg|jpeg|png)$/i);
    if (images.length < 4) return;

    console.log(`🛠️ Image Pipeline: Transforming ${images.length} valid images...`);
    try {
        const linkedinPath = path.join(OUTPUT_DIR, `LinkedIn_Post_${Date.now()}.png`);
        const currentTemplatePath = path.join('templates', 'linkedin', 'current.json');
        let templateId = config.linkedinTemplate.defaultId;
        if (fs.existsSync(currentTemplatePath)) {
            try {
                const cur = fs.readJsonSync(currentTemplatePath);
                if (cur && cur.templateId) templateId = cur.templateId;
            } catch (e) { /* ignore */ }
        }
        await applyLinkedInTemplate(images.slice(0, 6), templateId, linkedinPath);
        const copy = await generateCopy('linkedin', images.length);
        await fs.writeFile(linkedinPath.replace('.png', '.txt'), copy);
        console.log('✨ LinkedIn Post generated.');
        
        await updateCaseStudy();

        // Move processed images to processed/
        for (const imgPath of images) {
            try {
                const dest = path.join(PROCESSED_DIR, path.basename(imgPath));
                await fs.move(imgPath, dest, { overwrite: true });
            } catch (e) {
                console.error(`⚠️ Could not move ${imgPath} to processed: ${e.message}`);
            }
        }
    } catch (err) {
        console.error(`❌ LinkedIn Collage failed: ${err.message}`);
    }
}

async function triggerVideoPipeline() {
    const videos = await getValidAssets(/\.(mp4|mov)$/i);
    if (videos.length < 2) return;

    console.log(`🛠️ Video Pipeline: Transforming ${videos.length} valid videos...`);
    try {
        const reelPath = path.join(OUTPUT_DIR, `Instagram_Reel_${Date.now()}.mp4`);
        await createInstagramReel(videos, reelPath);
        const copy = await generateCopy('instagram', videos.length);
        await fs.writeFile(reelPath.replace('.mp4', '.txt'), copy);
        console.log('🎬 Instagram Reel generated.');

        await updateCaseStudy();

        // Move processed videos to processed/
        for (const videoPath of videos) {
            try {
                const dest = path.join(PROCESSED_DIR, path.basename(videoPath));
                await fs.move(videoPath, dest, { overwrite: true });
            } catch (e) {
                console.error(`⚠️ Could not move ${videoPath} to processed: ${e.message}`);
            }
        }
    } catch (err) {
        console.error(`❌ Instagram Reel failed: ${err.message}`);
    }
}

async function updateCaseStudy() {
    try {
        const csPath = path.join(OUTPUT_DIR, `CaseStudy_${Date.now()}.md`);
        await generateCaseStudy(assetLog, './template.md', csPath);
        console.log('📝 Case Study updated.');
    } catch (err) {
        console.error(`❌ Case Study generation failed: ${err.message}`);
    }
}
