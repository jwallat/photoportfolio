const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || '/photos';
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '.cache');
const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Resized variants served instead of the originals. Longest edge in pixels.
// Re-encoding drops all metadata (EXIF, GPS, camera serials) from the output.
const VARIANTS = {
    grid: 800,
    full: 2560,
};

fs.mkdirSync(CACHE_DIR, { recursive: true });

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Serve PhotoSwipe from our own origin, so visitors' IPs aren't sent to a CDN
app.use('/vendor/photoswipe', express.static(path.join(__dirname, 'node_modules/photoswipe/dist')));

// Variants currently being generated, so concurrent requests share one job
const inFlight = new Map();

async function getVariant(filepath, stat, variant) {
    const key = crypto
        .createHash('sha1')
        .update(`${path.basename(filepath)}:${stat.mtimeMs}:${stat.size}:${variant}`)
        .digest('hex');
    const cachePath = path.join(CACHE_DIR, `${key}.webp`);

    if (fs.existsSync(cachePath)) return cachePath;
    if (inFlight.has(key)) return inFlight.get(key);

    const job = (async () => {
        const maxEdge = VARIANTS[variant];
        const tmpPath = `${cachePath}.${process.pid}.tmp`;
        await sharp(filepath)
            .rotate() // apply EXIF orientation before the metadata is dropped
            .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(tmpPath);
        fs.renameSync(tmpPath, cachePath);
        return cachePath;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, job);
    return job;
}

// Serve resized, metadata-free copies of photos
app.get('/img/:variant/:filename', async (req, res) => {
    const { variant } = req.params;
    const filename = path.basename(req.params.filename); // prevent path traversal

    if (!VARIANTS[variant] || !SUPPORTED_EXTS.has(path.extname(filename).toLowerCase())) {
        return res.status(404).send('Not found');
    }

    const filepath = path.join(PHOTOS_DIR, filename);
    let stat;
    try {
        stat = fs.statSync(filepath);
    } catch {
        return res.status(404).send('Not found');
    }

    try {
        res.type('image/webp').sendFile(await getVariant(filepath, stat, variant));
    } catch (err) {
        console.error(`Cannot resize "${filename}":`, err.message);
        res.status(500).send('Cannot process image');
    }
});

// API: return list of images with the dimensions of their "full" variant
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
            const width = rotated ? dimensions.height : dimensions.width;
            const height = rotated ? dimensions.width : dimensions.height;
            const scale = Math.min(1, VARIANTS.full / Math.max(width, height));
            images.push({
                filename: file,
                width: Math.round(width * scale),
                height: Math.round(height * scale),
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
    console.log(`Caching resized photos in: ${CACHE_DIR}`);
});
