// Supabase Edge Function: ss-draw
//
// Svenska Spel's public draw API sends no `Access-Control-Allow-Origin`, so a
// browser on GitHub Pages cannot read it directly. This function is a tiny,
// read-only proxy with a strict product whitelist and a short cache header.
//
// Deploy:
//   supabase functions deploy ss-draw --project-ref <ref> --no-verify-jwt
//
// Call:
//   GET /functions/v1/ss-draw?product=europatipset&draw=2619

const UPSTREAM = 'https://api.spela.svenskaspel.se'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(request.url)
  const product = (url.searchParams.get('product') ?? 'europatipset').toLowerCase()
  const draw = url.searchParams.get('draw')

  if (!/^[a-z0-9-]{2,32}$/.test(product)) {
    return json({ error: 'Invalid product key' }, 400)
  }
  if (draw !== null && !/^[0-9]{1,6}$/.test(draw)) {
    return json({ error: 'Invalid draw number' }, 400)
  }

  const upstream = `${UPSTREAM}/draw/1/${product}/draws${draw ? `/${draw}` : ''}`

  try {
    const response = await fetch(upstream, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'tipping-league/1.0 (+https://github.com/Xel321123/tipping-league)',
      },
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400)
      return json({ error: `Svenska Spel responded ${response.status}`, detail }, 502)
    }

    return new Response(await response.text(), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=15, s-maxage=30',
      },
    })
  } catch (error) {
    return json({ error: 'Upstream fetch failed', detail: String(error) }, 502)
  }
})
