import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Guard for read-only endpoints.
 *
 * Write-only API keys (type === 'write') are not allowed to call query endpoints.
 * Session-authenticated requests (request.user is set) always pass.
 *
 * Returns true if the request is allowed to proceed, false if a 403 was sent.
 */
export async function requireFullAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  // Session-based auth: always allowed
  if ((request as any).user) return true;

  // API key auth: check scope
  if (request.apiKeyType === 'write') {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'This API key has write-only access. Use a full-access key to query logs.',
    });
    return false;
  }

  return true;
}
