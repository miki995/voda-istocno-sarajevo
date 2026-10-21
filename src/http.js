const MAX_BODY_CHARS = 8192;

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  const body = req.body;
  if (body && typeof body === 'object') {
    return JSON.stringify(body).length <= MAX_BODY_CHARS ? body : null;
  }
  if (typeof body === 'string' && body.length <= MAX_BODY_CHARS) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return null;
}
