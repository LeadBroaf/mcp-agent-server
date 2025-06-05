import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json());

// Auth middleware
app.use(async (req: Request, res: Response, next: NextFunction) => {
  // Public endpoints
  if (
    req.path === '/health' ||
    (req.path === '/users/register' && req.method === 'POST') ||
    (req.path === '/users/login' && req.method === 'POST')
  ) {
    return next();
  }
  const key = req.headers['x-api-key'];
  if (!key || typeof key !== 'string') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Check API key in DB
  const apiKey = await prisma.apiKey.findFirst({ where: { key, revoked: false }, include: { user: true } });
  if (!apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Attach user to request
  (req as any).user = apiKey.user;
  (req as any).apiKey = apiKey;
  next();
});

app.get('/health', (req: Request, res: Response): void => {
  res.send('OK');
});

// User registration
app.post('/users/register', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  res.status(201).json({ id: user.id, email: user.email });
});

// User login
app.post('/users/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  // Find or create API key
  let apiKey = await prisma.apiKey.findFirst({ where: { userId: user.id, revoked: false } });
  if (!apiKey) {
    const key = require('crypto').randomBytes(32).toString('hex');
    apiKey = await prisma.apiKey.create({ data: { key, userId: user.id } });
  }
  res.json({ apiKey: apiKey.key });
});

// List API keys for current user
app.get('/users/me/api-keys', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const apiKeys = await prisma.apiKey.findMany({ where: { userId: user.id }, select: { id: true, key: true, createdAt: true, revoked: true } });
  res.json(apiKeys);
});

// Create new API key for current user
app.post('/users/me/api-keys', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const key = require('crypto').randomBytes(32).toString('hex');
  const apiKey = await prisma.apiKey.create({ data: { key, userId: user.id } });
  res.status(201).json({ id: apiKey.id, key: apiKey.key, createdAt: apiKey.createdAt, revoked: apiKey.revoked });
});

// Revoke API key
app.delete('/users/me/api-keys/:id', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  const apiKey = await prisma.apiKey.findUnique({ where: { id } });
  if (!apiKey || apiKey.userId !== user.id) {
    res.status(404).json({ error: 'API key not found' });
    return;
  }
  await prisma.apiKey.update({ where: { id }, data: { revoked: true } });
  res.status(204).send();
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

// n8n trigger endpoint (robust integration)
app.post('/agents/:id/trigger', async (req: Request, res: Response): Promise<void> => {
  const agentId = Number(req.params.id);
  const payload = req.body;
  try {
    // Check agent exists
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    // Log the trigger event in agent memory
    await prisma.memory.create({
      data: {
        agentId,
        content: `n8n trigger received: ${JSON.stringify(payload)}`
      }
    });
    // Respond with acknowledgement and echo payload
    res.json({ status: 'Triggered', agentId, received: payload });
  } catch (e) {
    res.status(500).json({ error: 'Failed to process trigger' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
}); 