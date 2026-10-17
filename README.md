# Photo Portfolio

Self-hosted photography portfolio. Photos are served from a Nextcloud folder mounted read-only into the container. Drop a file in the folder — the next page load picks it up automatically.

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

```bash
npm install
PHOTOS_DIR="/path/to/your/photos" node server.js
```

Open [http://localhost:3000](http://localhost:3000).

`PHOTOS_DIR` defaults to `/photos` (the in-container path) if not set.

---

## Build & push a new release

```bash
# Build
docker build -t ghcr.io/jwallat/photoportfolio:latest .

# Log in to GHCR (once per machine, uses a Personal Access Token with write:packages scope)
echo $CR_PAT | docker login ghcr.io -u jwallat --password-stdin

# Push
docker push ghcr.io/jwallat/photoportfolio:latest
```

Tag a versioned release alongside `latest`:

```bash
docker tag ghcr.io/jwallat/photoportfolio:latest ghcr.io/jwallat/photoportfolio:1.0.0
docker push ghcr.io/jwallat/photoportfolio:1.0.0
```

---

## Deploy with Docker Compose

Set `PHOTOS_PATH` to the absolute path of your Nextcloud photos folder on the host:

```bash
PHOTOS_PATH="/mnt/nextcloud/Photos" docker compose up -d
```

Or export it in your shell / add it to a `.env` file next to `docker-compose.yml`:

```env
PHOTOS_PATH=/mnt/nextcloud/Photos
```

Then just:

```bash
docker compose up -d
```

### Update to a new image version

```bash
docker compose pull
docker compose up -d
```

---

## Project structure

```
├── server.js          # Express server — /api/images, /photos/:file, static
├── public/
│   ├── index.html     # Masonry gallery + PhotoSwipe viewer
│   ├── impressum.html # Impressum (fill in personal details)
│   └── privacy.html   # Privacy policy (fill in personal details)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PHOTOS_DIR` | `/photos` | Path to the photos directory inside the container |
| `PORT` | `3000` | Port the server listens on |
