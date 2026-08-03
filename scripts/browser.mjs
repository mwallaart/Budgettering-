// Waar staat Chromium? Lokaal is er een voorgeïnstalleerde browser op een vast
// pad; in GitHub Actions haalt `playwright-core install chromium` hem op en weet
// Playwright zelf waar hij staat. Vandaar: pad gebruiken als het bestaat, anders
// de eigen registratie van Playwright laten beslissen.
import fs from "node:fs";

const LOCAL = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export function launchOptions(extra = {}) {
  return fs.existsSync(LOCAL) ? { executablePath: LOCAL, ...extra } : { ...extra };
}
