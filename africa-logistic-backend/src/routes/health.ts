import { FastifyInstance } from 'fastify'

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/api/health', async (_request, _reply) => {
    return {
      status: 'ok',
      message: 'Africa Logistics Fastify API is running!',
      timestamp: new Date().toISOString()
    }
  })
}
