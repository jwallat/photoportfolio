# Photo Portfolio

Self-hosted photography portfolio. Photos are served from any folder (e.g. a synced Nextcloud folder) mounted read-only into the container. Drop a file in the folder — the next page load picks it up automatically.

---

## Photos and info texts

Supported formats are `.jpg`, `.jpeg`, `.png`, `.webp` and `.gif`. Photos are shown in filename order (natural and case-insensitive, so `IMG_2` comes before `IMG_10`). To control the order, prefix the filenames, e.g. `01-`, `02-`.

To give a photo an info text, put a `.txt` file with the same name next to it:

```text
Photos/
├── DSCF3049.JPG
└── DSCF3049.txt    # "Sunrise over the harbour."
```

In the lightbox, photos with an info text get an ⓘ button next to the close button. It shows the text in light grey below the photo, and the text stays on while swiping through other photos until the button is pressed again.

- The text is shown as plain text; line breaks are kept.
- The extension may be in any case (`.txt` or `.TXT`); empty files are ignored.
- New or edited texts appear on the next page load, without a restart.

---

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
PHOTOS_DIR="/path/to/your/photos" SITE_TITLE="My Photos" node server.js
```

Open [http://localhost:3000](http://localhost:3000).

Resized photos are cached in `.cache/` in the project folder. The page template is read once at startup, so restart the server after editing `public/index.html`.

---

## Privacy

Visitors never get the original files. The server makes resized WebP copies (800 px on the longest side for the gallery, 2560 px for the lightbox) and serves only those. Re-encoding drops all metadata, including EXIF, GPS location and camera serial numbers. The PhotoSwipe viewer is served from this server too, so no visitor data goes to a CDN.

---

## Releases

Publishing a release on GitHub runs [the publish workflow](.github/workflows/docker-publish.yml), which builds the image and pushes it to GHCR. A release tagged `v1.2.0` produces the image tags `latest`, `1.2.0` and `1.2`.

GHCR packages are private by default. Either make the package public in its settings on GitHub, or log in on every machine that pulls it:

```bash
# Personal Access Token with read:packages scope
echo $CR_PAT | docker login ghcr.io -u <your-github-username> --password-stdin
```

To build and push by hand instead (needs a token with `write:packages` scope):

```bash
docker build -t ghcr.io/jwallat/photoportfolio:latest .
docker push ghcr.io/jwallat/photoportfolio:latest
```

---

## Deploy with Docker Compose

Your settings live in a `.env` file next to `docker-compose.yml`, which Compose reads automatically. It is ignored by git, so personal details like your name and Impressum URL stay out of the repository:

```bash
cp .env.example .env
```

Set `PHOTOS_PATH` to the absolute path of your photos folder on the host, and optionally the site title and footer links (see [Environment variables](#environment-variables)):

```env
PHOTOS_PATH=/mnt/nextcloud/Photos
SITE_TITLE=My Photos
IMPRESSUM_URL=https://example.com/impressum
PRIVACY_URL=https://example.com/privacy
```

Then:

```bash
docker compose up -d
```

To run an image from a different registry or fork, set `IMAGE` in `.env` as well.

The container runs as an unprivileged user with UID 1000, so the photos and text files must be readable by that user (or by everyone). Resized photos are kept in the `cache` volume, so they survive updates. Docker reports the container as `healthy` once the photos folder is readable:

```bash
docker ps --filter name=photoportfolio --format '{{.Status}}'
```

### Update to a new image version

```bash
docker compose pull
docker compose up -d
```

### Test local changes in Docker

Build the image from your working copy under the same name, and stop Compose from pulling the published one:

```bash
docker build -t ghcr.io/jwallat/photoportfolio:latest .
docker compose up -d --pull never
```

---

## Project structure

```text
├── server.js                  # Express server: page, /api/images, /img/{grid,full}/:file, /healthz
├── public/
│   └── index.html             # Gallery, PhotoSwipe viewer, info texts; {{…}} filled in by the server
├── .github/workflows/
│   └── docker-publish.yml     # Builds and pushes the image when a release is published
├── Dockerfile
├── docker-compose.yml
├── .env.example               # Template for your personal settings in .env (not committed)
└── package.json
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PHOTOS_DIR` | `/photos` | Path to the photos directory |
| `CACHE_DIR` | `.cache/` in the project folder; `/cache` in the Docker image | Where resized photos are stored. Must be writable |
| `PORT` | `3000` | Port the server listens on |
| `SITE_TITLE` | `Photo Portfolio` | Shown in the header and the browser tab |
| `IMPRESSUM_URL` | – | Adds an "Impressum" link to the footer |
| `PRIVACY_URL` | – | Adds a "Privacy Policy" link to the footer |

Without `IMPRESSUM_URL` and `PRIVACY_URL`, the page has no footer.
