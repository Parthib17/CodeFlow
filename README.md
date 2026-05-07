# CodeFlow

Multi-language code execution visualizer. Step through Python and JavaScript line-by-line with live variable and data-structure panels. Run Java, C, C++, Go, Rust, C#, Kotlin, Swift, and more.

## Features

- **Step-by-step visualization** — Python (real CPython via Pyodide), JavaScript, Java, C, C++, Go, Rust, C#
- **Remote execution** — TypeScript, Ruby, PHP, Kotlin, Swift, Bash via Godbolt
- Monaco editor with syntax highlighting for all languages
- Variable panel, data-structure panel, timeline, complexity analysis
- Speed control, step-forward/back, auto-play

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
```

## Docker (recommended for VMs / droplets)

### Build and run

```bash
docker build -t codeflow .
docker run -d -p 80:80 --name codeflow codeflow
```

App is now live at `http://<your-server-ip>`.

### Run on a different port (e.g. 3000)

```bash
docker run -d -p 3000:80 --name codeflow codeflow
```

### Stop / remove

```bash
docker stop codeflow && docker rm codeflow
```

### Update to latest

```bash
git pull
docker build -t codeflow .
docker stop codeflow && docker rm codeflow
docker run -d -p 80:80 --name codeflow codeflow
```

## Deploy to a DigitalOcean Droplet (or any Ubuntu VM)

```bash
# 1. SSH in
ssh root@<your-droplet-ip>

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Clone the repo
git clone https://github.com/Parthib17/CodeFlow.git
cd CodeFlow

# 4. Build and run
docker build -t codeflow .
docker run -d -p 80:80 --restart unless-stopped --name codeflow codeflow
```

Open `http://<your-droplet-ip>` in a browser.

### With a domain + HTTPS (optional)

Install Caddy on the host (not inside Docker) and let it reverse-proxy to the container:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# /etc/caddy/Caddyfile
echo "yourdomain.com { reverse_proxy localhost:80 }" > /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy handles Let's Encrypt automatically.

## Tech stack

- React 19, Vite, Monaco Editor, Framer Motion
- Pyodide (CPython on WASM) for Python
- Godbolt Compile Explorer API for compiled languages
- nginx:alpine as the production web server
