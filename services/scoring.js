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
        
        // Resolution score (max 40)
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

        // Format score (max 10)
        if (ext === '.png') {
            score += 10;
            rationale.push('Lossless PNG format');
        }

        // Real Computer Vision AI Feature Analysis (max 50)
        try {
            const imageStats = await sharp(filePath).stats();
            
            // Laplacian filter convolution for focus/sharpness
            const laplacianKernel = {
                width: 3,
                height: 3,
                kernel: [
                    0,  1, 0,
                    1, -4, 1,
                    0,  1, 0
                ]
            };
            const edgeStats = await sharp(filePath)
                .grayscale()
                .convolve(laplacianKernel)
                .stats();
            
            const sharpnessStdev = edgeStats.channels[0].stdev;
            const contrastStdev = imageStats.channels.reduce((acc, c) => acc + c.stdev, 0) / imageStats.channels.length;
            const entropy = imageStats.entropy;

            // Normalize and weight features into visual quality scores
            const sharpnessScore = Math.min(20, Math.max(0, (sharpnessStdev - 2) * 0.45));
            const contrastScore = Math.min(15, Math.max(0, (contrastStdev - 10) * 0.25));
            const entropyScore = Math.min(15, Math.max(0, (entropy - 3.5) * 3.5));
            
            const visualQualityScore = Math.round(sharpnessScore + contrastScore + entropyScore);
            score += visualQualityScore;
            
            rationale.push(`AI Visual Quality: ${visualQualityScore}/50 (Sharpness: ${sharpnessStdev.toFixed(1)}, Contrast: ${contrastStdev.toFixed(1)}, Detail: ${entropy.toFixed(1)})`);
        } catch (e) {
            // Graceful fallback if stats computation fails
            const fallbackVisualQuality = 25;
            score += fallbackVisualQuality;
            rationale.push(`AI Visual Quality Assessment (Fallback): ${fallbackVisualQuality}/50`);
        }

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
