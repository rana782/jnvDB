/** Copy httpOnly JWT cookie into Authorization so @fastify/jwt jwtVerify works. */
export function registerJwtCookieHook(app: {
  addHook: (name: "onRequest", fn: (request: { cookies: { jnv_token?: string }; headers: { authorization?: string } }) => void | Promise<void>) => void;
}): void {
  app.addHook("onRequest", async (request) => {
    const c = request.cookies.jnv_token;
    if (c && !request.headers.authorization) {
      request.headers.authorization = `Bearer ${c}`;
    }
  });
}
