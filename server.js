const express = require('express');
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');

const app = express();
const PORT = process.env.PORT || 3000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || '/photos';
const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Serve individual photo files
app.get('/photos/:filename', (req, res) => {
    const filename = path.basename(req.params.filename); // prevent path traversal
    const filepath = path.join(PHOTOS_DIR, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Not found');
    }

    res.sendFile(filepath);
});

// API: return list of images with dimensions
app.get('/api/images', (req, res) => {
    let files;
    try {
        files = fs.readdirSync(PHOTOS_DIR);
    } catch (err) {
        console.error(`Cannot read photos directory "${PHOTOS_DIR}":`, err.message);
        return res.status(500).json({ error: 'Cannot read photos directory' });
    }

    const images = [];

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!SUPPORTED_EXTS.has(ext)) continue;

        const filepath = path.join(PHOTOS_DIR, file);
        try {
            const dimensions = sizeOf(filepath);
            // EXIF orientations 5–8 rotate the image 90° or 270°, so width and
            // height are swapped relative to what the browser will actually display.
            const rotated = dimensions.orientation >= 5 && dimensions.orientation <= 8;
            images.push({
                filename: file,
                width: rotated ? dimensions.height : dimensions.width,
                height: rotated ? dimensions.width : dimensions.height,
            });
        } catch (err) {
            console.warn(`Skipping "${file}": could not read dimensions (${err.message})`);
        }
    }

    res.json(images);
});

app.listen(PORT, () => {
    console.log(`Photoportfolio running on http://localhost:${PORT}`);
    console.log(`Serving photos from: ${PHOTOS_DIR}`);
});
