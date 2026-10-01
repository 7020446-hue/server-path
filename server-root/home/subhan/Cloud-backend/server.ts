import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';

// Cloud-Backend Custom Server Requirement:
// MUST configure to listen dynamically on process.env.PORT.
// Using a hardcoded port (e.g. 3000) causes 502 Bad Gateway errors on Cloud-Backend.
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      const { pathname, query } = parsedUrl;
      const host = (req.headers.host || '').split(':')[0];

      // Multi-tenant subdomain routing for Cloud-Backend
      const parts = host.split('.');
      if (parts.length > 2 || (host.includes('localhost') && parts.length > 1)) {
        const subdomain = parts[0];
        if (subdomain !== 'www' && subdomain !== 'api') {
          if (pathname === '/' || pathname === '') {
            return await app.render(req, res, `/app-landing/${subdomain}`, query);
          }
        }
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> [Cloud-Backend] Custom Server ready on http://${hostname}:${port} (listening on process.env.PORT=${process.env.PORT || port})`);
  });
});
