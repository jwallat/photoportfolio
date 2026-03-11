# Photo Portfolio

Self-hosted photography portfolio. Photos are served from a Nextcloud folder mounted read-only into the container. Drop a file in the folder — the next page load picks it up automatically.

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
