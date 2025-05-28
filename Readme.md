<div align="center">

<img src="/assets/Digital_Stacked_Green.png" width="360">

## WhatsApp Bot by 360

###### build using JavaScript and 💖

</div>

## Pre-requisites

You must have one of this packages installed:

- node/npm `<^v18>`
- bun `<^1.x>`

## Environment Setup

### 1. Install Dependencies

- **Bun** (recommended): https://bun.sh/docs/installation
- **Node.js** (v18+): https://nodejs.org/
- **FFmpeg**: Required for media processing
- **Google Chrome or Chromium**: Required for Puppeteer (browser automation)

### 2. OS-specific Setup

#### **Linux**

Install FFmpeg and Google Chrome/Chromium:

```bash
sudo apt update
sudo apt install ffmpeg
# For Google Chrome:
# Download from https://www.google.com/chrome/ and install:
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb
# Or for Chromium:
sudo apt install chromium-browser
```

- The bot is configured to use `/usr/bin/google-chrome` by default. If you use Chromium, change the path in `main.ts` to `/usr/bin/chromium-browser`.
- FFmpeg and FFprobe are expected at `/usr/bin/ffmpeg` and `/usr/bin/ffprobe`.

#### **Windows**

- Download and install [FFmpeg](https://ffmpeg.org/download.html) and add it to your PATH.
- Install [Google Chrome](https://www.google.com/chrome/) (default path is usually `C:\Program Files\Google\Chrome\Application\chrome.exe`).
- If you use a custom path, update the `executablePath` in `main.ts` accordingly.
- Update FFmpeg/FFprobe paths in `utils/mediaHelper.ts` if needed.

## Installation

Clone the GitHub repo:

```bash
git clone https://github.com/zelsaddr/wabot.git
cd wabot
```

Install all dependencies:

```bash
# With npm
npm install
# Or with Bun
bun install
```

## Running the Bot

### **Linux**
```bash
bun main.ts
# or
node main.js
```

### **Windows**
```bash
bun main.ts
# or
node main.js
```

> [!TIP]
> You can use `pm2` to run it in the background:
> ```bash
> pm2 start main.ts --interpreter bun
> # or
> pm2 start main.js --interpreter node
> ```
