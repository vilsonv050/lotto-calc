export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.headers.get("content-type")?.includes("text/html")) {
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
        .transform(response);
    }
    return response;
  },
};
