import { prisma } from '../database/client';

export async function getHealth() {
  let db: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }
  return { status: 'ok', db, version: process.env.npm_package_version ?? '0.0.1', time: new Date().toISOString() };
}
