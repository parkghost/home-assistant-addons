import http from "node:http";
import { Browser } from "./screenshot.js";
import { isAddOn, hassUrl, hassToken } from "./const.js";

const handler = async (request, response, { browser }) => {
  console.debug("Handling", request.url);
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    response.end();
    return;
  }
  const requestUrl = new URL(
    request.url,
    // We don't use this, but we need full URL for parsing.
    "http://localhost",
  );

  let extraWait = parseInt(requestUrl.searchParams.get("wait"));
  if (isNaN(extraWait)) {
    extraWait = isAddOn ? 2000 : 500;
  }
  const viewportParams = (requestUrl.searchParams.get("viewport") || "").split(
    "x",
  );
  for (let i = 0; i < 2; i++) {
    try {
      viewportParams[i] = parseInt(viewportParams[i]);
    } catch (err) {
      response.statusCode = 400;
      response.end();
    }
  }

  let image;
  try {
    image = await browser.screenshotHomeAssistant({
      pagePath: requestUrl.pathname,
      viewport: { width: viewportParams[0], height: viewportParams[1] },
      extraWait,
    });
  } catch (err) {
    console.error("Error generating screenshot", err);
    response.statusCode = 500;
    response.end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "image/png",
  });
  response.write(image);
  response.end();
};

const browser = new Browser(hassUrl, hassToken);
const port = 10000;
const server = http.createServer((request, response) =>
  handler(request, response, {
    browser,
  }),
);
server.listen(port);
const now = new Date();
const serverUrl = isAddOn
  ? `http://homeassistant.local:${port}`
  : `http://localhost:${port}`;
console.log(
  `[${now.getHours()}:${now.getMinutes()}] Visit server at ${serverUrl}/lovelace/0?viewport=1000x1000`,
);
