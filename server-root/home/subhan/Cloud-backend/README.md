# Cloud-Backend Multi-Tenant Platform 🚀

Directory: `/home/subhan/Cloud-backend/`

Cloud infrastructure orchestration backend and multi-tenant dynamic subdomain routing engine.

---

## ⚡ Custom Server Requirements

> [!IMPORTANT]
> If your framework uses a custom server script (like `server.ts` or `server.cjs`), you **must** configure it to listen on `process.env.PORT` and `0.0.0.0`.
> If you use a hardcoded port like `3000`, your app will crash with a **502 Bad Gateway** error in production.

### Compliant Server Implementations Included:
- **`server.ts`**: Next.js custom server with TypeScript and dynamic tenant subdomain routing.
- **`server.cjs`**: CommonJS custom server with `0.0.0.0` host binding and `process.env.PORT`.
