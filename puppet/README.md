# Screenshot Home Assistant using Puppeteer

Experiment to easily create screenshots of your dashboards using Puppeteer. Allowing you to put them on e-ink screens or any other screen that can display images.

[![Open your Home Assistant instance and show the dashboard of an add-on.](https://my.home-assistant.io/badges/supervisor_addon.svg)](https://my.home-assistant.io/redirect/supervisor_addon/?addon=7c0a2bff_puppet&repository_url=https%3A%2F%2Fgithub.com%2Fballoob%2Fhome-assistant-addons%2Ftree%2Fmain)

You will need to create a long lived access token and add it as an add-on option.

_This is a prototype, there is NO security. Anyone can access the server and make screenshots of any Home Assistant page._

## Usage

Starting the add-on will launch a new server on port 10000. Any path you request will return a screenshot of that page.

For example, to get a 1000px x 1000px screenshot of your default dashboard, fetch:

```
http://homeassistant.local:10000/lovelace/0?viewport=1000x1000
```

## Optimizations

This add-on is slow. On a Home Assistant Green, on cold-start, it takes ~10s. The browser is kept alive for up to 30 seconds. While the browser is loaded, the response is returned in 5 seconds.

From this wait time, 1.5 seconds is a hardcoded sleep to ensure all cards are done loading. Maybe a URL param can be used to control this, or an event.

The server is not thread-safe; which means it is unable to handle 2 requests at the same time. Contribution welcome.
