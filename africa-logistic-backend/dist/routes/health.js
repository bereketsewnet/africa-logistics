export default async function healthRoutes(fastify) {
    fastify.get('/api/health', async (_request, _reply) => {
        return {
            status: 'ok',
            message: 'Africa Logistics Fastify API is running!',
            timestamp: new Date().toISOString()
        };
    });
}
