const fs = require('fs');
const path = require('path');

function createSampleData(baseDir) {
  const root = path.join(baseDir, 'server-root', 'home', 'subhan', 'Cloud-backend');
  const subdomainDir = path.join(root, 'src', 'app', 'app-landing', '[subdomain]');

  fs.mkdirSync(subdomainDir, { recursive: true });

  // 1. page.tsx
  const pageTsx = `import React from 'react';
import { notFound } from 'next/navigation';
import { getTenantConfig } from '@/lib/tenant-resolver';
import TenantHero from '@/components/tenant/TenantHero';
import FeatureGrid from '@/components/tenant/FeatureGrid';
import PricingSection from '@/components/tenant/PricingSection';

interface PageProps {
  params: {
    subdomain: string;
  };
}

export async function generateMetadata({ params }: PageProps) {
  const tenant = await getTenantConfig(params.subdomain);
  if (!tenant) return { title: 'Workspace Not Found' };

  return {
    title: \`\${tenant.name} | Powered by Cloud-Backend\`,
    description: tenant.tagline || 'Next-generation cloud infrastructure platform.',
  };
}

export default async function SubdomainLandingPage({ params }: PageProps) {
  const { subdomain } = params;
  const config = await getTenantConfig(subdomain);

  if (!config) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500 selection:text-white">
      {/* Dynamic Subdomain Banner */}
      <div className="border-b border-indigo-500/20 bg-indigo-950/30 px-6 py-2.5 text-center text-xs font-mono text-indigo-300 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        Multi-Tenant Active Instance: <strong className="text-white underline">{subdomain}.cloud-backend.io</strong>
      </div>

      {/* Hero Section */}
      <TenantHero 
        name={config.name} 
        headline={config.headline} 
        ctaUrl={config.ctaUrl}
        accentColor={config.themeColor || '#6366f1'} 
      />

      {/* Dynamic Features Grid */}
      <FeatureGrid features={config.features} />

      {/* Pricing & Plan Details */}
      <PricingSection tiers={config.tiers} />
    </main>
  );
}
`;

  // 2. layout.tsx
  const layoutTsx = `import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
};

export default function SubdomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { subdomain: string };
}) {
  return (
    <div className="tenant-wrapper" data-subdomain={params.subdomain}>
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-white/10 px-8 py-4 flex justify-between items-center">
        <div className="font-bold tracking-tight text-lg text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-mono text-sm font-black shadow-lg shadow-indigo-500/30">
            {params.subdomain.charAt(0).toUpperCase()}
          </div>
          <span className="capitalize">{params.subdomain}</span>
        </div>
        <nav className="flex gap-6 text-sm text-zinc-300">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#docs" className="hover:text-white transition-colors">Documentation</a>
          <button className="px-4 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-md">
            Sign In
          </button>
        </nav>
      </header>
      {children}
    </div>
  );
}
`;

  // 3. route.ts
  const routeTs = `import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { subdomain: string } }
) {
  const { subdomain } = params;

  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: subdomain.toLowerCase() },
      include: {
        domainSettings: true,
        customTheme: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant record not found', code: 'TENANT_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      subdomain,
      tenantId: tenant.id,
      name: tenant.name,
      verified: tenant.isVerified,
      customDomain: tenant.domainSettings?.customDomain || null,
      sslStatus: tenant.domainSettings?.sslActive ? 'active' : 'pending',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: err.message },
      { status: 500 }
    );
  }
}
`;

  // 4. types.ts
  const typesTs = `export interface SubdomainConfig {
  subdomain: string;
  name: string;
  headline: string;
  tagline: string;
  themeColor: string;
  ctaUrl: string;
  features: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  tiers: Array<{
    name: string;
    price: number;
    billingPeriod: 'monthly' | 'yearly';
    features: string[];
    isPopular?: boolean;
  }>;
}

export interface TenantDomainResolution {
  isValid: boolean;
  tenantId?: string;
  customHost?: string;
  rewriteDestination?: string;
}
`;

  // 5. subdomain-config.json
  const configJson = JSON.stringify({
    tenantEngineVersion: "2.4.0",
    defaultSubdomain: "demo",
    supportedFeatures: [
      "dynamic-dns",
      "wildcard-ssl",
      "custom-branding",
      "analytics-telemetry"
    ],
    cacheControl: {
      sMaxAge: 3600,
      staleWhileRevalidate: 86400
    },
    routingRules: {
      enableCustomDomains: true,
      fallbackToRootOnNotFound: false,
      blockedSubdomains: ["admin", "api", "auth", "billing", "system", "internal"]
    }
  }, null, 2);

  // 6. styles.css
  const stylesCss = `:root {
  --primary-accent: #6366f1;
  --primary-glow: rgba(99, 102, 241, 0.35);
  --glass-bg: rgba(15, 23, 42, 0.75);
  --glass-border: rgba(255, 255, 255, 0.08);
}

.tenant-wrapper {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color-scheme: dark;
}

.hero-gradient-text {
  background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #818cf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.card-glass {
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.card-glass:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.4);
}
`;

  // 7. README.md
  const readmeMd = `# Subdomain Landing Module (Multi-Tenant)

Path: \`/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/\`

## Overview
This module handles dynamic multi-tenant customer landing pages and dashboard routing in **Cloud-backend**.
When incoming HTTP requests match \`https://{subdomain}.cloud-backend.io\` or a verified vanity domain, Next.js App Router serves this route dynamically.

## Key Files
- **\`page.tsx\`**: Server-side rendered landing page rendering tenant branding, dynamic theme colors, and products.
- **\`layout.tsx\`**: Shell layout with sticky navigation and tenant branding badge.
- **\`route.ts\`**: REST API endpoint for tenant domain verification & SSL health checks.
- **\`types.ts\`**: TypeScript definitions for tenant contracts.
- **\`subdomain-config.json\`**: Edge routing and reverse-proxy cache parameters.

## Local Development
\`\`\`bash
# Run cloud backend development server
npm run dev
# Test tenant route
curl http://localhost:3000/app-landing/acme-corp
\`\`\`
`;

  // 8. hero-preview.svg
  const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bg)" rx="16"/>
  <circle cx="400" cy="180" r="140" fill="#6366f1" opacity="0.15" filter="blur(40px)"/>
  <rect x="250" y="80" width="300" height="190" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <rect x="270" y="105" width="80" height="12" rx="4" fill="#6366f1"/>
  <rect x="270" y="130" width="220" height="8" rx="4" fill="#475569"/>
  <rect x="270" y="148" width="180" height="8" rx="4" fill="#334155"/>
  <rect x="270" y="180" width="90" height="28" rx="6" fill="url(#glow)"/>
  <text x="400" y="340" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">Cloud-Backend Subdomain Engine</text>
  <text x="400" y="375" fill="#94a3b8" font-family="monospace" font-size="14" text-anchor="middle">/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/</text>
</svg>`;

  fs.writeFileSync(path.join(subdomainDir, 'page.tsx'), pageTsx);
  fs.writeFileSync(path.join(subdomainDir, 'layout.tsx'), layoutTsx);
  fs.writeFileSync(path.join(subdomainDir, 'route.ts'), routeTs);
  fs.writeFileSync(path.join(subdomainDir, 'types.ts'), typesTs);
  fs.writeFileSync(path.join(subdomainDir, 'subdomain-config.json'), configJson);
  fs.writeFileSync(path.join(subdomainDir, 'styles.css'), stylesCss);
  fs.writeFileSync(path.join(subdomainDir, 'README.md'), readmeMd);
  fs.writeFileSync(path.join(subdomainDir, 'hero-preview.svg'), heroSvg);

  // Also create a few parent files in root Cloud-backend
  const pkgJson = JSON.stringify({
    name: "cloud-backend",
    version: "2.5.0",
    private: true,
    scripts: {
      "dev": "next dev",
      "build": "next build",
      "start": "next start"
    },
    dependencies: {
      "next": "^14.2.5",
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "@prisma/client": "^5.17.0"
    }
  }, null, 2);

  // server.ts (Custom Next.js Server complying with Cloud-Backend process.env.PORT)
  const serverTs = `import { createServer } from 'http';
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
            return await app.render(req, res, \`/app-landing/\${subdomain}\`, query);
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
    console.log(\`> [Cloud-Backend] Custom Server ready on http://\${hostname}:\${port} (listening on process.env.PORT=\${process.env.PORT || port})\`);
  });
});
`;

  // server.cjs (CommonJS variant complying with Cloud-Backend process.env.PORT)
  const serverCjs = `const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';

// Cloud-Backend Custom Server Requirement:
// Listen on dynamic process.env.PORT with fallback to avoid 502 Bad Gateway errors.
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error in request handler:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }).listen(port, hostname, () => {
    console.log(\`> [Cloud-Backend] Server listening on http://\${hostname}:\${port} (PORT=\${process.env.PORT || port})\`);
  });
});
`;

  fs.writeFileSync(path.join(root, 'server.ts'), serverTs);
  fs.writeFileSync(path.join(root, 'server.cjs'), serverCjs);
  fs.writeFileSync(path.join(root, 'package.json'), pkgJson);
  fs.writeFileSync(path.join(root, '.env.example'), `DATABASE_URL="postgresql://subhan:secret@localhost:5432/cloudbackend"\nNEXT_PUBLIC_APP_DOMAIN="cloud-backend.io"\nJWT_SECRET="super-secret-key-32-chars-long"\nPORT=3000\n`);
  
  const rootReadmeMd = `# Cloud-Backend Multi-Tenant Platform 🚀

Directory: \`/home/subhan/Cloud-backend/\`

Cloud infrastructure orchestration backend and multi-tenant dynamic subdomain routing engine.

---

## ⚡ Custom Server Requirements

> [!IMPORTANT]
> If your framework uses a custom server script (like \`server.ts\` or \`server.cjs\`), you **must** configure it to listen on \`process.env.PORT\` and \`0.0.0.0\`.
> If you use a hardcoded port like \`3000\`, your app will crash with a **502 Bad Gateway** error in production.

### Compliant Server Implementations Included:
- **\`server.ts\`**: Next.js custom server with TypeScript and dynamic tenant subdomain routing.
- **\`server.cjs\`**: CommonJS custom server with \`0.0.0.0\` host binding and \`process.env.PORT\`.
`;
  fs.writeFileSync(path.join(root, 'README.md'), rootReadmeMd);

  console.log('Sample directory populated at:', subdomainDir);
}

module.exports = { createSampleData };

if (require.main === module) {
  createSampleData(__dirname);
}
