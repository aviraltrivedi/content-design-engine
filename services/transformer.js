const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('ffmpeg-static');
const fs = require('fs-extra');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegInstaller);

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
    return new Promise((resolve, reject) => {
        let command = ffmpeg();
        videos.forEach(v => command = command.input(v));
        
        command
            .on('end', resolve)
            .on('error', reject)
            .mergeToFile(outputPath, path.dirname(outputPath));
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

module.exports = { createLinkedInCollage, createInstagramReel, generateCopy };
