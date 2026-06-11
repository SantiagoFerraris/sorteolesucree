export const config = { runtime: "edge" };

const HEADERS = (sessionid) => ({
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Accept": "application/json",
  "Accept-Language": "es-AR,es;q=0.9",
  "X-IG-App-ID": "936619743392459",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": "https://www.instagram.com/",
  "Cookie": `sessionid=${sessionid}; ds_user_id=0;`,
});

function urlToShortcode(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// Step 1: resolve shortcode → numeric media_id via GraphQL
async function getMediaId(shortcode, sessionid) {
  const gqlUrl = `https://www.instagram.com/api/graphql`;
  const body = new URLSearchParams({
    av: "0",
    __d: "www",
    __user: "0",
    __a: "1",
    __req: "1",
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "PolarisPostActionLoadPostQueryQuery",
    variables: JSON.stringify({ shortcode, fetch_comment_count: 0, fetch_like_count: 0 }),
    doc_id: "10015901848480474",
  });

  const res = await fetch(gqlUrl, {
    method: "POST",
    headers: { ...HEADERS(sessionid), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Error al acceder a la publicación (${res.status}). Verificá que sea pública y que el sessionid sea válido.`);

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Instagram devolvió una respuesta inesperada. Puede que el sessionid haya expirado."); }

  const media = data?.data?.xdt_shortcode_media || data?.data?.shortcode_media;
  if (!media) throw new Error("No se encontraron datos. ¿La publicación es pública? ¿El sessionid es correcto?");

  const postMeta = {
    shortcode,
    mediaId: media.id,
    owner: media.owner?.username || "desconocido",
    likeCount: media.edge_media_preview_like?.count || media.like_count || 0,
    commentCount: media.edge_media_to_parent_comment?.count || media.comment_count || 0,
    imageUrl: media.display_url || media.thumbnail_src || null,
    caption: media.edge_media_to_caption?.edges?.[0]?.node?.text || "",
  };

  return postMeta;
}

// Step 2: paginate ALL comments using the media timeline API
async function fetchAllComments(mediaId, sessionid, onProgress) {
  const allComments = [];
  let minId = null;
  let page = 0;
  const MAX_PAGES = 50; // safety cap — 50 pages × ~50 comments = up to 2500 comments

  while (page < MAX_PAGES) {
    const url = new URL(`https://www.instagram.com/api/v1/media/${mediaId}/comments/`);
    url.searchParams.set("can_support_threading", "true");
    url.searchParams.set("permalink_enabled", "false");
    if (minId) url.searchParams.set("min_id", minId);

    const res = await fetch(url.toString(), { headers: HEADERS(sessionid) });
    if (!res.ok) {
      if (res.status === 401) throw new Error("Sesión expirada o sessionid inválido. Obtenélo de nuevo desde Instagram.");
      if (res.status === 429) throw new Error("Instagram aplicó rate limiting. Esperá 1-2 minutos e intentá de nuevo.");
      throw new Error(`Error al cargar comentarios (${res.status}).`);
    }

    let data;
    try { data = await res.json(); } catch { throw new Error("Respuesta inesperada de Instagram al paginar comentarios."); }

    const comments = data?.comments || [];
    comments.forEach(c => {
      if (c.user?.username) {
        allComments.push({
          username: c.user.username,
          text: c.text || "",
          timestamp: c.created_at || 0,
        });
      }
    });

    onProgress?.(allComments.length);

    // Pagination: Instagram returns next_min_id when there are more pages
    const nextMinId = data?.next_min_id;
    if (!nextMinId || comments.length === 0) break;
    minId = nextMinId;
    page++;

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  return allComments;
}

export default async function handler(req) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const { searchParams } = new URL(req.url);
  const url       = searchParams.get("url");
  const sessionid = searchParams.get("sessionid")?.trim();

  if (!url)       return new Response(JSON.stringify({ error: "Falta el parámetro ?url=" }), { status: 400, headers });
  if (!sessionid) return new Response(JSON.stringify({ error: "Falta el parámetro ?sessionid=" }), { status: 400, headers });

  const shortcode = urlToShortcode(url);
  if (!shortcode) return new Response(JSON.stringify({ error: "URL inválida. Usá: https://www.instagram.com/p/CÓDIGO/" }), { status: 400, headers });

  try {
    const postMeta = await getMediaId(shortcode, sessionid);
    const comments = await fetchAllComments(postMeta.mediaId, sessionid, () => {});
    return new Response(JSON.stringify({ ok: true, postMeta, comments, total: comments.length }), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error desconocido" }), { status: 500, headers });
  }
}
