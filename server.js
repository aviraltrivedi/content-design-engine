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
app.use('/output', express.static('output'));

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
            const latestOutput = outputFiles
                .filter(f => /\.(png|jpg|jpeg|mp4)$/i.test(f))
                .sort((a, b) => fs.statSync(path.join('./output', b)).mtime - fs.statSync(path.join('./output', a)).mtime)
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
