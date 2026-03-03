import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Vercel Serverless Function – Proxy para a API CNPJA.
 *
 * Rota: GET /api/cnpj/:cnpj
 * Proxia a requisição para https://api.cnpja.com/office/:cnpj
 * adicionando o token de autorização armazenado nas env vars da Vercel.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { cnpj } = req.query

  if (!cnpj || typeof cnpj !== 'string') {
    return res.status(400).json({ error: 'CNPJ é obrigatório' })
  }

  const token = process.env.CNPJA_API_TOKEN || process.env.CNPJA_API_TOKEN2

  if (!token) {
    return res.status(500).json({ error: 'Token da API CNPJA não configurado' })
  }

  try {
    const response = await fetch(`https://api.cnpja.com/office/${cnpj}`, {
      headers: {
        Authorization: token
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json(data)
    }

    // Cache por 24h para evitar requests repetidos
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return res.status(502).json({ error: `Falha ao consultar CNPJA: ${message}` })
  }
}
