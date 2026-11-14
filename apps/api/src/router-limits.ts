/**
 * Router limits that must be set before any route is registered.
 *
 * Fastify's default `maxParamLength` is 100 characters: a longer path parameter
 * is rejected before the route runs (414, URI Too Long). Signed approval links
 * carry their whole token in the path (`/v1/approvals/:token`) and the token is
 * a base64url payload plus an HMAC signature, routinely longer than 100
 * characters once the run id, the single-use id and the subject are encoded.
 * Raising the limit keeps those links reachable.
 *
 * The value stays well below the token verifier's own ceiling
 * (`MAX_TOKEN_LENGTH` in `approval-token.ts`), so an oversized parameter is
 * rejected by the signature check rather than by the router.
 */
export const MAX_PARAM_LENGTH = 2048
