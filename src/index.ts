import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json());

// API key middleware
const API_KEY = process.env.API_KEY || 'changeme';
app.use((req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/health') return next();
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.get('/health', (req: Request, res: Response): void => {
  res.send('OK');
});

app.get('/agents', async (req: Request, res: Response): Promise<void> => {
  const agents = await prisma.agent.findMany();
  res.json(agents);
});

app.get('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json(agent);
});

app.post('/agents', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const agent = await prisma.agent.create({ data: { name } });
  res.status(201).json(agent);
});

app.put('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { name } = req.body;
  try {
    const agent = await prisma.agent.update({ where: { id }, data: { name } });
    res.json(agent);
  } catch (e) {
    res.status(404).json({ error: 'Agent not found' });
  }
});

app.delete('/agents/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  try {
    await prisma.agent.delete({ where: { id } });
    res.status(204).send();
  } catch (e) {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Agent memory endpoints
app.post('/agents/:id/memory', async (req: Request, res: Response): Promise<void> => {
  const agentId = Number(req.params.id);
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }
  try {
    const memory = await prisma.memory.create({ data: { agentId, content } });
    res.status(201).json(memory);
  } catch (e) {
    res.status(404).json({ error: 'Agent not found' });
  }
});

app.get('/agents/:id/memory', async (req: Request, res: Response): Promise<void> => {
  const agentId = Number(req.params.id);
  const memory = await prisma.memory.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } });
  res.json(memory);
});

// n8n trigger endpoint (stub)
app.post('/agents/:id/trigger', async (req: Request, res: Response): Promise<void> => {
  // For now, just acknowledge the trigger
  res.json({ status: 'Triggered', agentId: req.params.id });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
}); 