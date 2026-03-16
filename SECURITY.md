# Security Policy

**Security is our top priority.** clsh provides remote terminal access to your machine. Any security vulnerability could mean full machine compromise. We treat every report with urgency.

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to report

1. **GitHub Security Advisory** (preferred): [Create a private advisory](https://github.com/my-claude-utils/clsh/security/advisories/new)
2. **Email**: security@clsh.dev

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### Response timeline

- **48 hours**: We will acknowledge receipt of your report
- **7 days**: We will triage the vulnerability and provide an initial assessment
- **30 days**: We aim to release a fix for confirmed vulnerabilities

## Security Architecture

clsh is a remote shell tool, so we apply defense-in-depth at every layer:

### Authentication

- **Bootstrap tokens**: Single-use, 5-minute TTL, SHA-256 hashed in SQLite. Passed via URL hash fragment (never sent to server logs or proxy).
- **Password auth**: Server-side scrypt hashing (N=16384, r=8, p=1, 64-byte key, 16-byte random salt). Verification uses `crypto.timingSafeEqual` to prevent timing attacks.
- **Biometric auth**: WebAuthn with platform authenticator (Face ID / Touch ID). `userVerification: 'required'`. Credential IDs stored server-side for cross-context restoration.
- **JWT**: HS256 tokens with 30-day expiry. Authenticated via first WebSocket message (not URL query string).

### Transport security

- **HTTPS**: Enforced via ngrok SDK or SSH tunnel (localhost.run). Local Wi-Fi fallback warns about plain HTTP.
- **CORS**: Restricted to known origins (localhost, ngrok domains, tunnel URLs). No wildcard.
- **Security headers**: X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Content-Security-Policy, X-XSS-Protection.

### Rate limiting

- **Password/biometric login**: 5 requests per 15 minutes per IP
- **Bootstrap auth**: 10 requests per 15 minutes per IP
- **General API**: Standard Express rate limiting

### WebSocket hardening

- **Origin validation**: `verifyClient` callback rejects cross-origin upgrade requests
- **Max payload**: 64KB limit prevents memory exhaustion
- **Resize bounds**: Terminal dimensions clamped (cols: 1-500, rows: 1-200)
- **Auth required**: First message must be valid JWT or connection is terminated

### Lock screen (PWA)

- **Face ID + password**: Dual unlock methods, client-side WebAuthn + SHA-256 password verification
- **Server-side sync**: Biometric credentials and client password hashes stored server-side for PWA restoration (iOS PWAs get isolated localStorage)
- **Auto-lock**: Triggers on visibility change (tab switch, app background)

## Scope

**In scope:**

- Authentication and authorization bypasses
- Token/session hijacking or leakage
- WebSocket security issues
- PTY escape or command injection
- Tunnel exposure issues
- Sensitive data leakage
- Password hash weaknesses
- Biometric auth bypasses
- Dependencies with known CVEs

**Out of scope:**

- Issues requiring physical access to the host machine
- Social engineering attacks
- Denial of service (the agent runs locally, single-user)
- Issues in third-party services (ngrok, localhost.run)
- Vulnerabilities in outdated versions (please update first)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Recognition

We appreciate responsible disclosure. With your permission, we will credit you in the release notes and in a SECURITY_ACKNOWLEDGMENTS.md file.

## Security Best Practices for Users

- Keep your `NGROK_AUTHTOKEN` private; never commit it to version control
- Use a strong password (6+ characters) during lock screen setup
- Enable Face ID / Touch ID for quick, secure unlock
- Use a permanent ngrok domain with HTTPS for the safest remote access
- Run clsh on a trusted network when using local Wi-Fi fallback
- Keep Node.js and dependencies up to date
