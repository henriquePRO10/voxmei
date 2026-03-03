import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Vercel Serverless Function – Proxy para o Firebase Storage.
 *
 * Rota: GET /storage-proxy/*
 * Proxia requisições para https://firebasestorage.googleapis.com/*
 * para evitar problemas de CORS ao carregar imagens (ex: assinaturas).
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse | void> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // O path após /storage-proxy/ é capturado pelo catch-all
  const pathSegments = req.query.path
  if (!pathSegments) {
    return res.status(400).json({ error: 'Path é obrigatório' })
  }

  const storagePath = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments

  // Preserva a query string original (tokens do Firebase, etc.)
  const url = new URL(`https://firebasestorage.googleapis.com/${storagePath}`)
  const originalUrl = req.url || ''
  const queryStart = originalUrl.indexOf('?')
  if (queryStart !== -1) {
    const queryString = originalUrl.slice(queryStart + 1)
    for (const [key, value] of new URLSearchParams(queryString)) {
      url.searchParams.set(key, value)
    }
  }

  try {
    const response = await fetch(url.toString())

    if (!response.ok) {
      return res.status(response.status).end()
    }

    // Propaga content-type original
    const contentType = response.headers.get('content-type')
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }

    // Cache por 1h
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')

    const buffer = Buffer.from(await response.arrayBuffer())
    return res.status(200).send(buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return res.status(502).json({ error: `Falha no proxy de storage: ${message}` })
  }
}
