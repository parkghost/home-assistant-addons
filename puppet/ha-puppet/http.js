import http from "node:http";
import { Browser } from "./screenshot.js";
import { isAddOn, hassUrl, hassToken } from "./const.js";
import { CannotOpenPageError } from "./error.js";

class RequestHandler {
  constructor(browser) {
    this.browser = browser;
    this.busy = false;
    this.pending = [];
    this.requestCount = 0;
  }

  async handleRequest(request, response) {
    if (request.url === "/favicon.ico") {
      response.statusCode = 404;
      response.end();
      return;
    }

    const requestId = ++this.requestCount;
    console.debug(requestId, "Request", request.url);

    let start = new Date();
    if (this.busy) {
      console.log(requestId, "Busy, waiting in queue");
      await new Promise((resolve) => this.pending.push(resolve));
      const end = Date.now();
      console.log(requestId, `Wait time: ${end - start} ms`);
    }
    start = new Date();
    this.busy = true;

    try {
      console.debug(requestId, "Handling", request.url);
      const requestUrl = new URL(
        request.url,
        // We don't use this, but we need full URL for parsing.
        "http://localhost",
      );

      let extraWait = parseInt(requestUrl.searchParams.get("wait"));
      if (isNaN(extraWait)) {
        extraWait = undefined;
      }
      const viewportParams = (requestUrl.searchParams.get("viewport") || "")
        .split("x")
        .map((n) => parseInt(n));
      if (
        viewportParams.length != 2 ||
        !viewportParams.every((x) => !isNaN(x))
      ) {
        response.statusCode = 400;
        response.end();
        return;
      }

      let einkColors = parseInt(requestUrl.searchParams.get("eink"));
      if (isNaN(einkColors) || einkColors < 2) {
        einkColors = undefined;
      }

      let zoom = parseFloat(requestUrl.searchParams.get("zoom"));
      if (isNaN(zoom) || zoom <= 0) {
        zoom = 1;
      }

      const invert = requestUrl.searchParams.has("invert");

      let format = requestUrl.searchParams.get("format") || "png";
      if (!["png", "jpeg", "webp", "bmp"].includes(format)) {
        format = "png";
      }

      let rotate = parseInt(requestUrl.searchParams.get("rotate"));
      if (isNaN(rotate) || ![90, 180, 270].includes(rotate)) {
        rotate = undefined;
      }

      const requestParams = {
        pagePath: requestUrl.pathname,
        viewport: { width: viewportParams[0], height: viewportParams[1] },
        extraWait,
        einkColors,
        invert,
        zoom,
        format,
        rotate,
      };
      let image;
      try {
        const navigateResult = await this.browser.navigatePage(requestParams);
        console.debug(requestId, `Navigated in ${navigateResult.time} ms`);
        const screenshotResult = await this.browser.screenshotPage(
          requestParams,
        );
        console.debug(requestId, `Screenshot in ${screenshotResult.time} ms`);
        image = screenshotResult.image;
      } catch (err) {
        console.error(requestId, "Error generating screenshot", err);
        response.statusCode =
          err instanceof CannotOpenPageError ? err.status : 500;
        response.end();
        return;
      }

      // If eink processing happened, the format could be png or bmp
      const responseFormat = einkColors && format !== "bmp" ? "png" : format;
      let contentType;
      if (responseFormat === "jpeg") {
        contentType = "image/jpeg";
      } else if (responseFormat === "webp") {
        contentType = "image/webp";
      } else if (responseFormat === "bmp") {
        contentType = "image/bmp";
      } else {
        contentType = "image/png";
      }

      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": image.length,
      });
      response.write(image);
      response.end();
    } finally {
      this.busy = false;
      const resolve = this.pending.shift();
      if (resolve) {
        resolve();
      }
    }
  }
}

const browser = new Browser(hassUrl, hassToken);
const requestHandler = new RequestHandler(browser);
const port = 10000;
const server = http.createServer((request, response) =>
  requestHandler.handleRequest(request, response),
);
server.listen(port);
const now = new Date();
const serverUrl = isAddOn
  ? `http://homeassistant.local:${port}`
  : `http://localhost:${port}`;
console.log(
  `[${now.toLocaleTimeString()}] Visit server at ${serverUrl}/lovelace/0?viewport=1000x1000`,
);
