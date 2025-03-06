import puppeteer from "puppeteer";
import { debug, isAddOn } from "./const.js";

// These are JSON stringified values
const hassLocalStorageDefaults = {
  dockedSidebar: `"always_hidden"`,
  selectedTheme: `{"dark": false}`,
};

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
    this.browser = await puppeteer.launch({
      headless: "shell",
      executablePath: isAddOn
        ? "/usr/bin/chromium"
        : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });
    this.page = await this.browser.newPage();

    // Route all log messages from browser to our add-on log
    // https://pptr.dev/api/puppeteer.pageevents
    if (debug)
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
        .on("response", (response) =>
          console.log(
            `RESPONSE ${response.status()} ${response.url()} (cache: ${response.fromCache()})`,
          ),
        )
        .on("requestfailed", (request) =>
          console.log(
            `REQUEST-FAILED ${request.failure().errorText} ${request.url()}`,
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
            return panelResolver && !panelResolver._loading;
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
