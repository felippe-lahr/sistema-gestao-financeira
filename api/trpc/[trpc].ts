import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '../../server/routers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Convert Vercel request to Fetch API request
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  
  const fetchRequest = new Request(url, {
    method: req.method,
    headers: new Headers(req.headers as any),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
  });

  const fetchResponse = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: fetchRequest,
    router: appRouter,
    createContext: async () => ({
      req: req as any,
      res: res as any,
      user: null, // TODO: Implement authentication
    }),
  });

  // Convert Fetch API response to Vercel response
  res.status(fetchResponse.status);
  
  fetchResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const body = await fetchResponse.text();
  res.send(body);
}
