# MarketSpace — Multi-Vendor E-Commerce Platform

Enterprise-grade, secure, multi-vendor marketplace platform featuring multi-role access control, Somali mobile money payments (EVC Plus, Zaad, Sahal, eDahab), cash-on-delivery settlements, server-authoritative transactions, and AI-assisted tooling.

---

## 1. Architecture & Security Specifications

- **Server-Authoritative Gateways:** All financial operations (order creation, payouts, refunds, payment reviews, role assignments) execute exclusively via Node.js Express endpoints backed by the Google Cloud Firebase Admin SDK.
- **Custom Claims & Role Hierarchy:**
  - `role`: `'CUSTOMER' | 'SELLER' | 'RESTAURANT' | 'DRIVER' | 'ADMIN' | 'SUPER_ADMIN'`
  - `admin`: boolean flag set on `ADMIN` and `SUPER_ADMIN`
  - `super_admin`: boolean flag set strictly on `SUPER_ADMIN`
  - Synchronized authoritatively via `syncUserCustomClaims(uid, role)`. Tokens require refresh (`getIdToken(true)`) upon role upgrade.
- **Account Suspension Enforcement:** Every mutating endpoint verifies caller active status against Firestore (`assertUserAccountActive(uid)`) to immediately revoke access for `SUSPENDED` or `BANNED` accounts.
- **Financial Invariants:**
  - Commission rate bounds: `0% <= rate <= 50%` enforced uniformly across all gateways and setting updates.
  - Payment method allowlist: Canonical validation against `MASTER_PAYMENT_METHODS`.
  - Double-refund prevention: Cloud Firestore distributed atomic transactions with composite idempotency locking.

---

## 2. Environment Variables

Create `.env` (or configure in hosting dashboard) using the following required variables:

```bash
# Server & Runtime Configuration
NODE_ENV=production
PORT=3000

# Google Cloud & Firebase Admin SDK (Server-Side)
# Option A: Individual credentials
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Option B: Standard Google Cloud Application Credentials file path
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# Client-Side Firebase Configuration (Vite)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

---

## 3. Local Development & Testing

```bash
# Install dependencies
npm install

# Run development server (Node.js + Vite middleware)
npm run dev

# Run comprehensive deterministic security and financial audit test suite
npm run test

# Run AI security and prompt injection regression suite
npm run test:ai

# Type check codebase
npm run lint
```

---

## 4. Production Build & Start

The production build compiles the Vite frontend client into `dist/` and bundles the full-stack Express server with esbuild into `dist/server.cjs`:

```bash
# Production build
npm run build

# Start production server
npm run start
```

---

## 5. Health Check Endpoint

The server exposes a zero-dependency JSON health check endpoint:
```http
GET /api/health
Response: 200 OK
{
  "status": "ok",
  "timestamp": "2026-09-24T03:00:00.000Z"
}
```

---

## 6. Firebase Rules & Cloud Infrastructure

### A. Firestore Rules Deployment
```bash
firebase deploy --only firestore:rules
```

### B. Storage Rules Deployment
```bash
firebase deploy --only storage
```
*Note on Storage Validation:* Firebase Storage Security Rules enforce authentication, user ownership, metadata `contentType` allowlisting (images/PDFs), and a 5MB size limit. Full binary content-sniffing / file magic-byte decoding cannot be executed within Storage Rules and requires a server-side Cloud Function or pipeline.

### C. Rate Limit TTL Policy
Distributed rate-limiting documents in the `rate_limits` collection include an `expiresAt` timestamp. To activate automated document deletion in Google Cloud Firestore, run the following GCP CLI command:
```bash
gcloud firestore fields ttls update expiresAt --collection-group=rate_limits
```

### D. Firestore Composite Indexes
Deploy required composite indexes via:
```bash
firebase deploy --only firestore:indexes
```

---

## 7. Render Deployment (`render.yaml`)

This repository includes a native Blueprint configuration file (`render.yaml`):

1. Link this repository in the **Render Dashboard**.
2. Select **New Blueprint Instance**.
3. Render automatically detects `render.yaml` with:
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Health Check Path:** `/api/health`
4. Populate secret environment variables (`FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `GEMINI_API_KEY`, etc.) in the Render Environment Dashboard.
