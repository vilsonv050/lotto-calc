export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";
    const assetRequest =
      url.href === request.url ? request : new Request(url, request);
    const response = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(response.headers);
    if (
      headers.get("content-type")?.includes("text/html") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css")
    ) {
      headers.set("cache-control", "no-store");
    }
    const uncachedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    if (headers.get("content-type")?.includes("text/html")) {
      const imageUrl = new URL("/og.png", request.url).href;
      return new HTMLRewriter()
        .on('meta[property="og:image"]', {
          element(element) {
            element.setAttribute("content", imageUrl);
          },
        })
        .on('meta[name="twitter:image"]', {
          element(element) {
            element.setAttribute("content", imageUrl);
          },
        })
        .transform(uncachedResponse);
    }
    return uncachedResponse;
  },
};
