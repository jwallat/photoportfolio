const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const PHOTOS_DIR = process.env.PHOTOS_DIR || '/photos';
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '.cache');
const SITE_TITLE = process.env.SITE_TITLE || 'Photo Portfolio';
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

// Serve the page with site settings from the environment filled in
const escapeHtml = (str) => str.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const footerLinks = [
    ['Impressum', process.env.IMPRESSUM_URL],
    ['Privacy Policy', process.env.PRIVACY_URL],
]
    .filter(([, url]) => url)
    .map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label}</a>`);
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
    .replaceAll('{{SITE_TITLE}}', escapeHtml(SITE_TITLE))
    .replace('{{FOOTER}}', footerLinks.length ? `<footer>\n        ${footerLinks.join('\n        ')}\n    </footer>` : '');

app.get(['/', '/index.html'], (req, res) => res.type('html').send(indexHtml));

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

// Dimensions per filename, reused while the file's mtime and size are unchanged
const dimensionCache = new Map();

async function getDimensions(file) {
    const filepath = path.join(PHOTOS_DIR, file);
    const { mtimeMs, size } = await fs.promises.stat(filepath);
    const cached = dimensionCache.get(file);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached;

    // autoOrient holds the dimensions after applying EXIF orientation,
    // i.e. what the resized variants will actually be
    const { autoOrient: { width, height } } = await sharp(filepath).metadata();
    const scale = Math.min(1, VARIANTS.full / Math.max(width, height));
    const entry = {
        mtimeMs,
        size,
        width: Math.round(width * scale),
        height: Math.round(height * scale),
    };
    dimensionCache.set(file, entry);
    return entry;
}

// Info texts per .txt filename, reused while the file's mtime and size are unchanged
const captionCache = new Map();

async function getCaption(txtFile) {
    const filepath = path.join(PHOTOS_DIR, txtFile);
    const { mtimeMs, size } = await fs.promises.stat(filepath);
    const cached = captionCache.get(txtFile);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.text;

    const text = (await fs.promises.readFile(filepath, 'utf8')).trim();
    captionCache.set(txtFile, { mtimeMs, size, text });
    return text;
}

// Natural, case-insensitive filename order: "IMG_2" before "IMG_10", "a" next to "B"
const filenameOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// API: return list of images with the dimensions of their "full" variant
app.get('/api/images', async (req, res) => {
    let files;
    try {
        files = await fs.promises.readdir(PHOTOS_DIR);
    } catch (err) {
        console.error(`Cannot read photos directory "${PHOTOS_DIR}":`, err.message);
        return res.status(500).json({ error: 'Cannot read photos directory' });
    }

    const photos = files
        .filter((file) => SUPPORTED_EXTS.has(path.extname(file).toLowerCase()))
        .sort(filenameOrder.compare);

    // Info text files, by the photo name they belong to: "DSCF3049.txt" → "DSCF3049"
    const txtFiles = new Map(files
        .filter((file) => path.extname(file).toLowerCase() === '.txt')
        .map((file) => [path.parse(file).name, file]));

    // Forget files that were removed from the directory
    for (const file of dimensionCache.keys()) {
        if (!photos.includes(file)) dimensionCache.delete(file);
    }
    for (const file of captionCache.keys()) {
        if (!files.includes(file)) captionCache.delete(file);
    }

    const images = await Promise.all(photos.map(async (file) => {
        let image;
        try {
            const { width, height } = await getDimensions(file);
            image = { filename: file, width, height };
        } catch (err) {
            console.warn(`Skipping "${file}": could not read dimensions (${err.message})`);
            return null;
        }

        const txtFile = txtFiles.get(path.parse(file).name);
        if (txtFile) {
            try {
                const caption = await getCaption(txtFile);
                if (caption) image.caption = caption;
            } catch (err) {
                console.warn(`Ignoring "${txtFile}": could not read it (${err.message})`);
            }
        }
        return image;
    }));

    res.json(images.filter(Boolean));
});

const server = app.listen(PORT, () => {
    console.log(`Photoportfolio running on http://localhost:${PORT}`);
    console.log(`Serving photos from: ${PHOTOS_DIR}`);
    console.log(`Caching resized photos in: ${CACHE_DIR}`);
});

// As PID 1 in a container, Node ignores SIGTERM unless it is handled, which
// makes `docker stop` wait for its 10s timeout and then kill the process
function shutdown(signal) {
    console.log(`Received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    // Don't wait forever for slow clients
    setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
