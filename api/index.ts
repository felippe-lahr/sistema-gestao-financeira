import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from '../server/routers';
import { createContext } from '../server/_core/context';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Create tRPC caller
    const caller = appRouter.createCaller(await createContext({ req, res }));
    
    // Parse request body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Extract procedure path and input
    const path = req.url?.replace('/api/', '').split('?')[0] || '';
    const [router, procedure] = path.split('.');
    
    if (!router || !procedure) {
      res.status(400).json({ error: 'Invalid procedure path' });
      return;
    }

    // Call the procedure
    const result = await (caller as any)[router][procedure](body.input);
    
    res.status(200).json({ result: { data: result } });
  } catch (error: any) {
    console.error('tRPC error:', error);
    res.status(500).json({ 
      error: { 
        message: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_SERVER_ERROR'
      } 
    });
  }
}
