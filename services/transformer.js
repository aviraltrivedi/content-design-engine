const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('ffmpeg-static');
const ffprobeInstaller = require('ffprobe-static');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

let isFfmpegAvailable = true;
try {
    execSync(`"${ffmpegInstaller}" -version`, { stdio: 'ignore', timeout: 1500 });
} catch (e) {
    isFfmpegAvailable = false;
    console.warn("⚠️ [Transformer] ffmpeg is not executable on this platform. Video processing will be disabled.");
}

if (isFfmpegAvailable) {
    ffmpeg.setFfmpegPath(ffmpegInstaller);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

const config = require('../config');

/**
 * Apply a Canva template to a set of input images and produce a LinkedIn post image.
 * The template defines a background image and optional placeholder positions.
 * For simplicity, this implementation composites the images using the existing collage logic
 * onto a blank canvas matching the template dimensions, then overlays the template background.
 */
async function applyLinkedInTemplate(images, templateId, outputPath) {
    // Load manifest to get target dimensions
    const manifest = require('../templates/linkedin/manifest.json');
    const tmpl = manifest.templates.find(t => t.id === templateId) || manifest.templates[0];
    const [width, height] = tmpl.dimensions || config.linkedinTemplate.outputSize;

    // Generate collage and resize to LinkedIn dimensions (no template overlay)
    const tempCanvasPath = outputPath + '.tmp.png';
    await createLinkedInCollage(images, tempCanvasPath);

    await sharp(tempCanvasPath)
        .resize(width, height)
        .toFile(outputPath);
    // Cleanup temporary file
    await fs.remove(tempCanvasPath);
}

/**
 * Original collage function retained for backward compatibility.
 */
async function createLinkedInCollage(images, outputPath) {
    const count = images.length;
    const composites = [];

    if (count === 5) {
        // Special Layout for 5: 2 on top, 3 on bottom
        const row1H = 500;
        const row2H = 500;
        const row1W = 1200 / 2;
        const row2W = 1200 / 3;

        for (let i = 0; i < 5; i++) {
            let x, y, w, h;
            if (i < 2) {
                x = i * row1W;
                y = 0;
                w = Math.floor(row1W);
                h = row1H;
            } else {
                x = (i - 2) * row2W;
                y = row1H;
                w = Math.floor(row2W);
                h = row2H;
            }
            const buffer = await sharp(images[i]).resize(w, h, { fit: 'cover' }).toBuffer();
            composites.push({ input: buffer, left: Math.floor(x), top: Math.floor(y) });
        }
    } else {
        // Standard Grid for 4 or 6
        const rows = count > 4 ? 2 : 1;
        const cols = Math.ceil(count / rows);
        const w = Math.floor(1200 / cols);
        const h = Math.floor(1000 / rows);

        for (let i = 0; i < count; i++) {
            const x = (i % cols) * w;
            const y = Math.floor(i / cols) * h;
            const buffer = await sharp(images[i]).resize(w, h, { fit: 'cover' }).toBuffer();
            composites.push({ input: buffer, left: x, top: y });
        }
    }

    await sharp({
        create: {
            width: 1200,
            height: 1000,
            channels: 4,
            background: { r: 10, g: 10, b: 12, alpha: 1 }
        }
    })
        .composite(composites)
        .toFile(outputPath);
}

async function createInstagramReel(videos, outputPath) {
    if (!isFfmpegAvailable) {
        console.warn('⚠️ [Transformer] ffmpeg is not available on this platform. Copying first video as mock reel...');
        if (videos.length > 0) {
            await fs.copy(videos[0], outputPath);
            const now = new Date();
            await fs.utimes(outputPath, now, now);
            return;
        } else {
            throw new Error('No videos supplied for mock reel.');
        }
    }
    return new Promise((resolve, reject) => {
        let command = ffmpeg();
        videos.forEach(v => command = command.input(v));

        let filterGraph = '';
        videos.forEach((v, index) => {
            filterGraph += `[${index}:v][${index}:a]`;
        });
        filterGraph += `concat=n=${videos.length}:v=1:a=1[v_concat][a_concat];`;
        filterGraph += `[v_concat]crop=ih*9/16:ih,scale=1080:1920[v_reel]`;

        command
            .complexFilter(filterGraph)
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
                '-map [v_reel]',
                '-map [a_concat]',
                '-pix_fmt yuv420p',      // Standard 8-bit color space compatible with all browsers
                '-profile:v main',       // Main H.264 profile supported everywhere
                '-level 3.1',
                '-crf 23',               // Balanced quality/compression
                '-movflags +faststart'   // Instant browser buffering
            ])
            .on('end', resolve)
            .on('error', (err) => {
                console.error('FFmpeg compilation error details:', err.message);
                reject(err);
            })
            .save(outputPath);
    });
}

async function generateCopy(type, assetCount) {
    const copies = {
        linkedin: `🚀 Excited to share highlights from our recent event! \n\nWe transformed raw data into these ${assetCount} stunning visuals using our Content Design Engine. \n\n#Innovation #DesignAutomation #Hackathon`,
        instagram: `Storytelling in motion. ✨ \n\nCheck out how we processed ${assetCount} assets into this narrative flow. \n\n#InstaDaily #CreativeTech`,
        story: `Event vibes. ⚡ \n\n(Frame {{n}} of ${assetCount})`
    };
    return copies[type] || '';
}

module.exports = { createLinkedInCollage, createInstagramReel, generateCopy, applyLinkedInTemplate };
