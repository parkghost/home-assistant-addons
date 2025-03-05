import http from "node:http";
import { screenshotHomeAssistant } from "./screenshot.js";

const handler = async (request, response, { homeAssistantUrl }) => {
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

  const pageUrl = new URL(requestUrl.pathname, homeAssistantUrl).toString();
  let image;
  try {
    image = await screenshotHomeAssistant({
      pageUrl,
      viewport: { width: viewportParams[0], height: viewportParams[1] },
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

const port = 10000;
const server = http.createServer((request, response) =>
  handler(request, response, {
    homeAssistantUrl: "http://homeassistant:8123",
  }),
);
server.listen(port);
const now = new Date();
console.log(
  `[${now.getHours()}:${now.getMinutes()}] Visit server at http://homeassistant.local:${port}/lovelace/0?viewport=1000x1000`,
);
