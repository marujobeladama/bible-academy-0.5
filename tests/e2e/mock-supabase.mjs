import { createServer } from 'node:http';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  response.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/health') {
    response.writeHead(200).end('{"ok":true}');
    return;
  }

  if (url.pathname === '/auth/v1/user') {
    response.writeHead(401).end('{"message":"No authenticated test user"}');
    return;
  }

  if (url.pathname.startsWith('/rest/v1/')) {
    response.writeHead(200, { 'Content-Range': '*/0' }).end('[]');
    return;
  }

  response.writeHead(404).end('{"message":"Not found"}');
});

server.listen(54321, '127.0.0.1');