const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

console.log('🧹 Cleaning up ecosystem directories for a fresh start...');
try {
    // Empty watched directories
    fs.emptyDirSync('./input');
    fs.emptyDirSync('./output');
    fs.emptyDirSync('./processed');
    fs.emptyDirSync('./low-confidence');
    
    // Overwrite the audit trail log to start completely blank
    fs.writeJsonSync('./rationale.json', [], { spaces: 2 });
    
    console.log('✅ Clean-up complete. Starting ecosystem fresh!');
} catch (e) {
    console.error('⚠️ Clean-up warning:', e.message);
}

console.log('🚀 Starting Content & Design Engine Ecosystem...');

const server = spawn('node', ['server.js'], { stdio: 'inherit' });
const engine = spawn('node', ['engine.js'], { stdio: 'inherit' });

process.on('SIGINT', () => {
    server.kill();
    engine.kill();
    process.exit();
});
