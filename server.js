const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = 3000;

// Setup storage for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'input/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// Ensure directories exist
fs.ensureDirSync('input');
fs.ensureDirSync('output');

app.use(express.static('web'));
app.use(express.json());
app.use('/output', express.static('output'));
// LinkedIn template manifest endpoint
app.get('/templates/linkedin/manifest', async (req, res) => {
    try {
        const manifest = await fs.readJson(path.join('templates', 'linkedin', 'manifest.json'));
        res.json(manifest);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Get current selected template (fallback to default)
app.get('/templates/linkedin/current', async (req, res) => {
    try {
        const cur = await fs.readJson(path.join('templates', 'linkedin', 'current.json'));
        res.json(cur);
    } catch (e) {
        res.json({ templateId: 'professional-1' });
    }
});
// Set current selected template
app.post('/templates/linkedin/current', async (req, res) => {
    const { templateId } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId required' });
    try {
        await fs.writeJson(path.join('templates', 'linkedin', 'current.json'), { templateId });
        res.json({ message: 'Template updated', templateId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload endpoint
app.post('/upload', upload.array('assets'), (req, res) => {
    console.log(`🚀 ${req.files.length} files uploaded to input/`);
    res.json({ message: 'Files uploaded successfully. Engine is processing...', count: req.files.length });
});

// Results endpoint
app.get('/results', async (req, res) => {
    try {
        const rationalePath = './rationale.json';
        if (await fs.exists(rationalePath)) {
            const data = await fs.readJson(rationalePath);
            
            // Get latest output files
            const outputFiles = await fs.readdir('./output');
            const filteredFiles = outputFiles.filter(f => /\.(png|jpg|jpeg|mp4|md|txt)$/i.test(f));
            
            const latestOutput = filteredFiles
                .map(f => {
                    const stats = fs.statSync(path.join('./output', f));
                    return { name: f, size: stats.size, mtime: stats.mtime };
                })
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, 5);

            res.json({ logs: data, latestOutput });
        } else {
            res.json({ logs: [], latestOutput: [] });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Server running at http://localhost:${PORT}`);
});
