import puppeteer from "puppeteer";
import { debug, isAddOn } from "./const.js";

// These are JSON stringified values
const hassLocalStorageDefaults = {
  dockedSidebar: `"always_hidden"`,
  selectedTheme: `{"dark": false}`,
};

// From https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/
const puppeteerArgs = [
  "--autoplay-policy=user-gesture-required",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-dev-shm-usage",
  "--disable-domain-reliability",
  "--disable-extensions",
  "--disable-features=AudioServiceOutOfProcess",
  "--disable-hang-monitor",
  "--disable-ipc-flooding-protection",
  "--disable-notifications",
  "--disable-offer-store-unmasked-wallet-cards",
  "--disable-popup-blocking",
  "--disable-print-preview",
  "--disable-prompt-on-repost",
  "--disable-renderer-backgrounding",
  "--disable-setuid-sandbox",
  "--disable-speech-api",
  "--disable-sync",
  "--hide-scrollbars",
  "--ignore-gpu-blacklist",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-default-browser-check",
  "--no-first-run",
  "--no-pings",
  "--no-sandbox",
  "--no-zygote",
  "--password-store=basic",
  "--use-gl=swiftshader",
  "--use-mock-keychain",
];

export class Browser {
  browser = undefined;
  page = undefined;
  lastAccess = new Date();
  TIMEOUT = 30_000; // 30s

  constructor(homeAssistantUrl, token) {
    this.homeAssistantUrl = homeAssistantUrl;
    this.token = token;
    this.busy = false;
    this.pending = [];
  }

  async cleanup() {
    const diff = this.busy ? 0 : new Date() - this.lastAccess;

    // instance was used since scheduling cleanup, postpone
    if (diff < this.TIMEOUT) {
      setTimeout(() => this.cleanup(), this.TIMEOUT - diff + 1000);
      return;
    }

    this.busy = true;
    try {
      const page = this.page;
      const browser = this.browser;
      this.page = undefined;
      this.browser = undefined;
      await page.close();
      await browser.close();
      console.log("Closed browser");
    } finally {
      this.busy = false;
    }
  }

  async getPage() {
    if (this.page) {
      return this.page;
    }

    console.log("Starting browser");
    this.browser = await puppeteer.launch(
      isAddOn
        ? {
            headless: "shell",
            executablePath: "/usr/bin/chromium",
            args: puppeteerArgs,
          }
        : {
            headless: "shell",
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            args: puppeteerArgs,
          },
    );
    this.page = await this.browser.newPage();

    // Route all log messages from browser to our add-on log
    // https://pptr.dev/api/puppeteer.pageevents
    this.page
      .on("console", (message) =>
        console.log(
          `CONSOLE ${message
            .type()
            .substr(0, 3)
            .toUpperCase()} ${message.text()}`,
        ),
      )
      .on("error", (err) => console.error("ERROR", err))
      .on("pageerror", ({ message }) => console.log("PAGE ERROR", message))
      .on("requestfailed", (request) =>
        console.log(
          `REQUEST-FAILED ${request.failure().errorText} ${request.url()}`,
        ),
      );
    if (debug)
      this.page.on("response", (response) =>
        console.log(
          `RESPONSE ${response.status()} ${response.url()} (cache: ${response.fromCache()})`,
        ),
      );

    const clientId = new URL("/", this.homeAssistantUrl).toString(); // http://homeassistant.local:8123/
    const hassUrl = clientId.substring(0, clientId.length - 1); // http://homeassistant.local:8123

    // Store access token in local storage when page is opened
    await this.page.evaluateOnNewDocument(
      (hassUrl, clientId, token, hassLocalStorage) => {
        console.log("Initializing local storage");
        for (const [key, value] of Object.entries(hassLocalStorage)) {
          localStorage.setItem(key, value);
        }
        localStorage.setItem(
          "hassTokens",
          JSON.stringify({
            access_token: token,
            token_type: "Bearer",
            expires_in: 1800,
            hassUrl,
            clientId,
            expires: 9999999999999,
            refresh_token: "",
          }),
        );
      },
      hassUrl,
      clientId,
      this.token,
      hassLocalStorageDefaults,
    );
    setTimeout(() => this.cleanup(), this.TIMEOUT);
    return this.page;
  }

  async screenshotHomeAssistant({ pagePath, viewport }) {
    let start = new Date();
    if (this.busy) {
      console.log("Busy, waiting in queue");
      await new Promise((resolve) => this.pending.push(resolve));
      const end = Date.now();
      console.log(`Wait time: ${end - start} ms`);
    }
    start = new Date();
    this.busy = true;

    try {
      const page = await this.getPage();
      await page.setViewport(viewport);

      const pageUrl = new URL(pagePath, this.homeAssistantUrl).toString();
      await page.goto(pageUrl);

      try {
        // Wait for the page to be loaded.
        await page.waitForFunction(
          () => {
            const haEl = document.querySelector("home-assistant");
            if (!haEl) return false;
            const mainEl = haEl.shadowRoot.querySelector("home-assistant-main");
            if (!mainEl) return false;
            const panelResolver = mainEl.shadowRoot.querySelector(
              "partial-panel-resolver",
            );
            if (!panelResolver || panelResolver._loading) {
              return false;
            }

            const panel = panelResolver.children[0];
            if (!panel) return false;

            return !("_loading" in panel) || !panel._loading;
          },
          {
            timeout: 20000,
          },
        );
      } catch (err) {
        console.log("Timeout waiting for HA to finish loading");
      }

      // wait for the work to be done.
      // Not sure yet how to decide that?
      await new Promise((resolve) => setTimeout(resolve, isAddOn ? 1500 : 500));

      const image = await page.screenshot();

      const end = Date.now();
      console.log(`Screenshot time: ${end - start} ms`);

      return image;
    } finally {
      this.lastAccess = new Date();
      this.busy = false;
      const resolve = this.pending.shift();
      if (resolve) {
        resolve();
      }
    }
  }
}
