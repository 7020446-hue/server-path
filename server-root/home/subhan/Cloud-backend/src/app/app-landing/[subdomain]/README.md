# Subdomain Landing Module (Multi-Tenant)

Path: `/home/subhan/Cloud-backend/src/app/app-landing/[subdomain]/`

## Overview
This module handles dynamic multi-tenant customer landing pages and dashboard routing in **Cloud-backend**.
When incoming HTTP requests match `https://{subdomain}.cloud-backend.io` or a verified vanity domain, Next.js App Router serves this route dynamically.

## Key Files
- **`page.tsx`**: Server-side rendered landing page rendering tenant branding, dynamic theme colors, and products.
- **`layout.tsx`**: Shell layout with sticky navigation and tenant branding badge.
- **`route.ts`**: REST API endpoint for tenant domain verification & SSL health checks.
- **`types.ts`**: TypeScript definitions for tenant contracts.
- **`subdomain-config.json`**: Edge routing and reverse-proxy cache parameters.

## Local Development
```bash
# Run cloud backend development server
npm run dev
# Test tenant route
curl http://localhost:3000/app-landing/acme-corp
```
