# ngrok Setup Guide

clsh uses a tunnel to expose your local terminal server to your phone. By default, it uses a free SSH tunnel via localhost.run, which works with zero configuration but gives you a new URL every time you restart.

For a **permanent URL** that survives restarts (ideal for saving as a PWA on your phone's home screen), set up ngrok.

## What ngrok does

ngrok creates a secure HTTPS tunnel from a public URL to your local clsh server. With a free static domain, you get the same URL every time, so your phone's saved bookmark/PWA always connects.

## Setup (5 minutes)

### 1. Create a free ngrok account

Go to [ngrok.com](https://ngrok.com) and sign up. The free tier includes everything you need:
- 1 static domain
- Unlimited bandwidth for personal use

### 2. Run the setup wizard

```bash
npx clsh-dev setup
```

This will prompt you for:
- Your **authtoken** (from [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken))
- Your **static domain** (from [dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains))

The wizard saves these to `~/.clsh/config.json` so you only need to do this once.

### 3. Start clsh

```bash
npx clsh-dev
```

You should see your permanent ngrok URL in the QR code output. Scan it on your phone and save it to your home screen.

## Manual configuration

If you prefer to set things up manually instead of using the wizard:

### Option A: Config file

Create `~/.clsh/config.json`:

```json
{
  "ngrokAuthtoken": "your-authtoken-here",
  "ngrokStaticDomain": "your-name.ngrok-free.dev"
}
```

### Option B: Environment variables

```bash
NGROK_AUTHTOKEN=your-authtoken-here NGROK_STATIC_DOMAIN=your-name.ngrok-free.dev npx clsh-dev
```

### Option C: .env file (for cloned repo)

If you cloned the repo, add to your `.env` file at the repo root:

```
NGROK_AUTHTOKEN=your-authtoken-here
NGROK_STATIC_DOMAIN=your-name.ngrok-free.dev
```

## Configuration priority

When multiple sources are set, clsh uses this priority (highest wins):

1. Environment variables
2. `.env` file (repo root or current directory)
3. `~/.clsh/config.json`
4. Defaults (SSH tunnel, port 4030)

## Troubleshooting

### "ERR_NGROK_..." errors

Make sure your authtoken is correct. You can re-run `npx clsh-dev setup` to update it.

### ngrok interstitial warning page

Free ngrok URLs show a browser warning page on first visit. This only appears once per session in a browser. The clsh web app connects via WebSocket, which is not affected by the interstitial.

### Want to skip ngrok entirely?

Force the SSH tunnel method:

```bash
TUNNEL=ssh npx clsh-dev
```

Or for local network only (no internet tunnel):

```bash
TUNNEL=local npx clsh-dev
```

### Where is my authtoken?

Visit [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken).

### Where is my static domain?

Visit [dashboard.ngrok.com/domains](https://dashboard.ngrok.com/domains). Click "New Domain" if you don't have one yet (one free domain per account).
