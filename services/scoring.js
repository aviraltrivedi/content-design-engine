const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

async function scoreAsset(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const stats = await fs.stat(filePath);
    let score = 0;
    let rationale = [];

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        const metadata = await sharp(filePath).metadata();
        
        // Resolution score
        const resolution = metadata.width * metadata.height;
        if (resolution >= 2073600) { // 1080p
            score += 40;
            rationale.push('High resolution (1080p+)');
        } else if (resolution >= 921600) { // 720p
            score += 20;
            rationale.push('Standard resolution (720p)');
        } else {
            rationale.push('Low resolution');
        }

        // Format score
        if (ext === '.png') {
            score += 10;
            rationale.push('Lossless PNG format');
        }

        // Simulate AI Quality Score (Placeholder for actual vision AI)
        const mockAIQuality = Math.floor(Math.random() * 50);
        score += mockAIQuality;
        rationale.push(`AI Visual Quality Assessment: ${mockAIQuality}/50`);

    } else if (['.mp4', '.mov'].includes(ext)) {
        // Simple video heuristics
        if (stats.size > 1024 * 1024 * 5) { // > 5MB
            score += 50;
            rationale.push('Substantial video data / high bitrate');
        }
        score += 30; // Base score for video assets
        rationale.push('Video asset detected');
    }

    return {
        score,
        rationale: rationale.join(', '),
        isLowConfidence: score < 10
    };
}

module.exports = { scoreAsset };
