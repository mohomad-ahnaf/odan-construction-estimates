const path = require('node:path');
const fs = require('node:fs');
const browserRoot = path.join(__dirname, '.cache', 'playwright');
let executablePath;
const selectedBrowser = path.join(__dirname, '.cache', 'browser.json');
if (fs.existsSync(selectedBrowser)) {
  const selected = JSON.parse(fs.readFileSync(selectedBrowser, 'utf8'));
  if (typeof selected.executablePath === 'string' && fs.existsSync(selected.executablePath)) executablePath = selected.executablePath;
}
if (!executablePath && fs.existsSync(browserRoot)) {
  for (const directory of fs.readdirSync(browserRoot).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
    for (const binary of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
      const candidate = path.join(browserRoot, directory, binary);
      if (fs.existsSync(candidate)) { executablePath = candidate; break; }
    }
    if (executablePath) break;
  }
}
module.exports = { skipDownload: true, cacheDirectory: path.join(__dirname, '.cache', 'puppeteer'), ...(executablePath ? { executablePath } : {}) };
