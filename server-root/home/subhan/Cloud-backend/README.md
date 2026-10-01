# Cloud-Backend Multi-Tenant Platform 🚀

Directory: `/home/subhan/Cloud-backend/`

Cloud infrastructure orchestration backend and multi-tenant dynamic subdomain routing engine.

---

## ⚡ Custom Server Requirements

> [!IMPORTANT]
> If your framework uses a custom server script (like `server.ts` or `server.cjs`), you **must** configure it to listen on `process.env.PORT` and `0.0.0.0`.
> If you use a hardcoded port like `3000`, your app will crash with a **502 Bad Gateway** error in production.

### Compliant Server Implementations Included:
- **[`server.ts`](file:///c:/Users/setup/Videos/Websites/Done/server%20path/server-root/home/subhan/Cloud-backend/server.ts)**: Next.js custom server with TypeScript and dynamic tenant subdomain routing.
- **[`server.cjs`](file:///c:/Users/setup/Videos/Websites/Done/server%20path/server-root/home/subhan/Cloud-backend/server.cjs)**: CommonJS custom server with `0.0.0.0` host binding and `process.env.PORT`.

---

## 📁 Directory Architecture

```
/home/subhan/Cloud-backend/
├── server.ts                       # Custom Next.js server (PORT=process.env.PORT)
├── server.cjs                      # CommonJS server fallback
├── package.json                    # Project metadata & scripts
├── .env.example                    # Environment variable template
└── src/
    └── app/
        └── app-landing/
            └── [subdomain]/        # Dynamic Multi-Tenant Subdomain Landing Engine
                ├── page.tsx        # Dynamic landing page component
                ├── layout.tsx      # Shell layout with tenant branding
                ├── route.ts        # Tenant verification & SSL status API
                ├── types.ts        # TypeScript interface definitions
                ├── subdomain-config.json # Tenant routing rules
                ├── styles.css      # Tenant styling system
                └── hero-preview.svg# Visual banner asset
```

---

## 🛠️ How Multi-Tenant Subdomains Work

Incoming requests targeting:
```
https://{subdomain}.cloud-backend.io
```
are dynamically routed to:
```
/app-landing/[subdomain]/
```
The page fetches tenant customization (branding colors, features, pricing tiers) from the database using the subdomain slug and serves server-side rendered landing pages.
