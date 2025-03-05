import puppeteer from "puppeteer";
import { options } from "./const.js";

// These are JSON stringified values
const hassLocalStorageDefaults = {
  dockedSidebar: `"always_hidden"`,
  selectedTheme: `{"dark": false}`,
};

// From https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/
const minimalArgs = [
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

// to do
// - move screenshot function into Browser
// - ensure only 1 task active at a time

class Browser {
  browser = undefined;
  page = undefined;
  lastAccess = new Date();
  TIMEOUT = 30_000; // 30s

  constructor(homeAssistantUrl, token) {
    this.homeAssistantUrl = homeAssistantUrl;
    this.token = token;
  }

  async cleanup() {
    const diff = new Date() - this.lastAccess;

    // we got accessed since schedule, postpone
    if (diff < this.TIMEOUT) {
      setTimeout(() => this.cleanup(), this.TIMEOUT - diff + 1000);
      return;
    }

    const page = this.page;
    const browser = this.browser;
    this.page = undefined;
    this.browser = undefined;
    await page.close();
    await browser.close();
    console.log("Closed browser");
  }

  async getPage() {
    this.lastAccess = new Date();
    if (this.page) {
      return this.page;
    }

    setTimeout(() => this.cleanup(), this.TIMEOUT)

    this.browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium",
      headless: "shell",
      args: [
        ...minimalArgs,
        // ??
        "--single-process",
      ],
    });

    const pageUrl = this.homeAssistantUrl;
    const clientId = new URL("/", pageUrl).toString(); // http://localhost:8123/
    const hassUrl = clientId.substring(0, clientId.length - 1); // http://localhost:8123

    // Launch the browser and open a new blank page
    const page = await this.browser.newPage();
    this.page = page;

    // make it tiny so we don't render too much
    await page.setViewport({ width: 10, height: 10 });
    // Route all log messages from browser to our add-on log
    // https://pptr.dev/api/puppeteer.pageevents
    page
      .on("console", (message) =>
        console.log(
          `CONSOLE ${message
            .type()
            .substr(0, 3)
            .toUpperCase()} ${message.text()}`
        )
      )
      .on("error", (err) => console.error("ERROR", err))
      .on("pageerror", ({ message }) => console.log("PAGE ERROR", message))
      .on("response", (response) =>
        console.log(
          `RESPONSE ${response.status()} ${response.url()} (cache: ${response.fromCache()})`
        )
      )
      .on("requestfailed", (request) =>
        console.log(
          `REQUEST-FAILED ${request.failure().errorText} ${request.url()}`
        )
      );

    // Store access token in local storage when page is opened
    await page.evaluateOnNewDocument(
      (hassUrl, clientId, token, hassLocalStorage) => {
        console.log("Initializing local storage");
        console.log(
          "Existing local storage",
          Object.entries(localStorage)
            .map((el) => el.join(": "))
            .join(", ")
        );
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
          })
        );
      },
      hassUrl,
      clientId,
      this.token,
      hassLocalStorageDefaults
    );
    return page;
  }
}

const BROWSER = new Browser("http://homeassistant:8123", options.access_token);


export const screenshotHomeAssistant = async ({ pageUrl, viewport }) => {
  const start = new Date();

  const page = await BROWSER.getPage();

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
          "partial-panel-resolver"
        );
        return panelResolver && !panelResolver._loading;
      },
      {
        timeout: 20000,
      }
    );
  } catch (err) {
    console.log("Timeout waiting for HA to finish loading");
  }

  // wait for the work to be done.
  // Not sure yet how to decide that?
  await new Promise((resolve) => setTimeout(resolve, 1500));

  await page.setViewport(viewport);
  const image = await page.screenshot();

  const end = Date.now();
  console.log(`Screenshot time: ${end - start} ms`);

  await page.setViewport({ width: 10, height: 10 });

  return image;
};
