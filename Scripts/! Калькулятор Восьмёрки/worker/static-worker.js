const productIds = new Set(["103151", "108031", "109031"]);

async function proxy(request, url) {
  const productId = url.searchParams.get("productId") || "";
  if (!productIds.has(productId)) {
    return Response.json({ error: "Неизвестная лотерея" }, { status: 400 });
  }
  const upstream = url.pathname.endsWith("/history")
    ? `https://nloto.ru/api/v2/products/${productId}/draws/history?page=0&size=50`
    : `https://nloto.ru/api/v3/products/${productId}/rules`;
  try {
    return await fetch(upstream, {
      headers: {
        accept: "application/json, text/plain, */*",
        referer: "https://nloto.ru/",
        "user-agent": request.headers.get("user-agent") || "Mozilla/5.0",
      },
    });
  } catch {
    return Response.json(
      { error: "Источник НЛОТО временно недоступен." },
      { status: 502 },
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname === "/api/nloto/history" ||
      url.pathname === "/api/nloto/rules"
    ) {
      return proxy(request, url);
    }
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
