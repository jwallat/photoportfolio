const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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

// Health check for Docker: healthy when the photos directory is readable
app.get('/healthz', (req, res) => {
    try {
        fs.accessSync(PHOTOS_DIR, fs.constants.R_OK);
        res.send('ok');
    } catch {
        res.status(503).send('photos directory not readable');
    }
});

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
        // The cache path is built by us, so it's fine that it may live in a dot-directory
        res.type('image/webp').sendFile(await getVariant(filepath, stat, variant), { dotfiles: 'allow' });
    } catch (err) {
        console.error(`Cannot resize "${filename}":`, err.message);
        res.status(500).send('Cannot process image');
    }
});

// API: return list of images with the dimensions of their "full" variant
app.get('/api/images', async (req, res) => {
    let files;
    try {
        files = fs.readdirSync(PHOTOS_DIR);
    } catch (err) {
        console.error(`Cannot read photos directory "${PHOTOS_DIR}":`, err.message);
        return res.status(500).json({ error: 'Cannot read photos directory' });
    }

    const photos = files.filter((file) => SUPPORTED_EXTS.has(path.extname(file).toLowerCase()));

    const images = await Promise.all(photos.map(async (file) => {
        try {
            // autoOrient holds the dimensions after applying EXIF orientation,
            // i.e. what the resized variants will actually be
            const { autoOrient: { width, height } } = await sharp(path.join(PHOTOS_DIR, file)).metadata();
            const scale = Math.min(1, VARIANTS.full / Math.max(width, height));
            return {
                filename: file,
                width: Math.round(width * scale),
                height: Math.round(height * scale),
            };
        } catch (err) {
            console.warn(`Skipping "${file}": could not read dimensions (${err.message})`);
            return null;
        }
    }));

    res.json(images.filter(Boolean));
});

app.listen(PORT, () => {
    console.log(`Photoportfolio running on http://localhost:${PORT}`);
    console.log(`Serving photos from: ${PHOTOS_DIR}`);
    console.log(`Caching resized photos in: ${CACHE_DIR}`);
});
