# Authentication System — Complete Guide

A complete explanation of how token-based authentication works in this project,
covering every concept from scratch with the reasoning behind each decision.

---

## Table of Contents

1. [What is an Access Token?](#1-what-is-an-access-token)
2. [What is a Refresh Token?](#2-what-is-a-refresh-token)
3. [Why Two Tokens?](#3-why-two-tokens)
4. [Where Are Tokens Stored?](#4-where-are-tokens-stored)
5. [The httpOnly Cookie](#5-the-httponly-cookie)
6. [What Happens on Page Reload?](#6-what-happens-on-page-reload)
7. [The Full Auth Flow](#7-the-full-auth-flow)
8. [Token Refresh Flow](#8-token-refresh-flow)
9. [Refresh Token Rotation](#9-refresh-token-rotation)
10. [Reuse Detection — The Most Important Security Feature](#10-reuse-detection)
11. [Frontend Integration Guide](#11-frontend-integration-guide)
12. [Security Protections in This Project](#12-security-protections-in-this-project)
13. [What Happens If a Hacker Steals a Token?](#13-what-happens-if-a-hacker-steals-a-token)
14. [API Reference](#14-api-reference)

---

## 1. What is an Access Token?

An access token is a short-lived credential that proves you are authenticated.
Every time you call a protected API endpoint, you send this token and the server
uses it to verify who you are.

- Lives for **15 minutes** only
- Stored in the browser (explained in section 4)
- Sent automatically on every request
- If stolen, it becomes useless after 15 minutes by itself

The reason it is short-lived is intentional. If someone steals it, the damage
window is tiny. After 15 minutes it is completely worthless.

---

## 2. What is a Refresh Token?

A refresh token is a long-lived credential used for **one purpose only** — to
get a new access token when the old one expires. It never directly accesses
your data or APIs.

- Lives for **7 days**
- Stored in an httpOnly cookie (JavaScript cannot read it)
- Only ever sent to the `/auth/refresh` endpoint
- Gets replaced with a brand new token every single time it is used (rotation)
- Saved in the database so it can be revoked at any time

Think of it like this: the access token is your ID badge that gets you through
doors, and the refresh token is the HR system that issues new ID badges when
yours expires.

---

## 3. Why Two Tokens?

A single long-lived token is a security disaster. If someone steals it, they
have access forever. A single short-lived token forces users to login every
15 minutes, which is terrible UX.

Two tokens solve both problems:

- The access token travels on every single API request, so it is exposed more
  often. Keeping it short-lived limits the damage if it is intercepted.

- The refresh token travels rarely — only to one specific endpoint. This makes
  it much harder to steal. And because it lives in the database, it can be
  instantly revoked.

This is the same pattern used by Google, GitHub, Auth0, and every major
authentication provider in the world.

---

## 4. Where Are Tokens Stored?

This project uses **Strategy 1: Both tokens in httpOnly cookies**.

When the server calls `res.cookie("accessToken", token)` and
`res.cookie("refreshToken", token)`, both tokens are written directly into
the browser's cookie storage on disk. The frontend JavaScript code never sees
them, never touches them, and never needs to manage them manually.

The browser automatically attaches both cookies to every request made to your
domain. This is handled entirely by the browser itself.

### What about "memory storage"?

You may have heard that access tokens should be stored in memory (a JavaScript
variable). That is a different strategy — Strategy 2 — where the backend sends
the access token in the JSON response body instead of a cookie, and the
frontend stores it in a `let accessToken = null` variable.

That strategy is more complex because:
- The JS variable is gone every time the page reloads
- The frontend must manually attach the token to every request header
- The frontend must run a silent refresh on every page load to restore the token

This project uses Strategy 1 (both in cookies) because it is simpler, equally
secure, and requires zero token management on the frontend. Companies like
GitHub use this exact approach.

### What you must NEVER do

Never store tokens in `localStorage` or `sessionStorage`. These are accessible
to any JavaScript on your page. If your site ever has an XSS vulnerability,
an attacker can steal every token from every user instantly with one line of
JavaScript.

---

## 5. The httpOnly Cookie

An httpOnly cookie is a special type of cookie that the browser will never
expose to JavaScript. You cannot read it with `document.cookie`. You cannot
access it with `fetch` or `axios`. It does not exist from JavaScript's
perspective.

Only the browser itself can read it, and the browser sends it automatically
on every matching request.

This is critical for the refresh token because:
- Even if your site has an XSS vulnerability, the attacker's injected JavaScript
  cannot steal the refresh token
- The access token expiring in 15 minutes limits the damage window even further

The `secure` flag ensures the cookie is only sent over HTTPS in production,
so it cannot be intercepted over plain HTTP connections.

The `sameSite: strict` flag ensures the cookie is never sent on cross-site
requests, which prevents CSRF attacks where a malicious website tricks your
browser into making requests to your API.

---

## 6. What Happens on Page Reload?

This is one of the most commonly misunderstood parts of token authentication.

When a user reloads the page, nothing bad happens. Here is the exact sequence:

1. Page reloads — if using Strategy 2 (memory), the access token JS variable
   is wiped. If using Strategy 1 (cookies, which this project uses), the access
   token cookie survives because cookies persist on disk across reloads.

2. The app initializes and checks for a valid session.

3. If using cookie strategy — the access token cookie is either still valid
   (user is seamlessly authenticated) or expired (app hits `/auth/refresh`
   silently).

4. The refresh token cookie is still there because it lives for 7 days and
   cookies survive page reloads.

5. The server validates the refresh token, issues a new access token, and the
   user is back in — without ever seeing a login screen.

The user only gets logged out when:
- They click logout (tokens explicitly cleared)
- The refresh token expires after 7 days of inactivity
- The server revokes the refresh token (admin action or security event)
- Reuse detection triggers (explained in section 10)

---

## 7. The Full Auth Flow

### Registration and Login

When a user registers or logs in successfully, the server does the following:

1. Validates the input (name, email, password format)
2. Verifies credentials (for login)
3. Generates a new access token (expires in 15 minutes)
4. Generates a new refresh token (expires in 7 days)
5. Saves the refresh token in the database against the user record
6. Sets both tokens as httpOnly cookies in the response
7. Returns the user object in the JSON response (no tokens in the body)

The frontend receives the user data and the browser automatically stores both
cookies. The frontend never sees the token values.

### Making API Calls

Every subsequent request to a protected endpoint automatically includes both
cookies. The auth middleware on the server reads the access token cookie,
verifies its signature and expiry, and either allows the request or returns
a 401 with the code `TOKEN_EXPIRED`.

---

## 8. Token Refresh Flow

When the access token expires, the server returns a 401 response with
`"code": "TOKEN_EXPIRED"`. The frontend detects this specific code and
automatically calls `POST /auth/refresh` before retrying the original request.

The user sees none of this. Their action just completes normally with a
slight delay of one extra network request.

This is called a **silent refresh** or **transparent refresh**. It is the
mechanism that keeps users logged in for days without interruption.

On the frontend using axios, this is implemented using a **response interceptor** —
a piece of middleware that runs on every response before it reaches your
component code. The interceptor checks for the `TOKEN_EXPIRED` code, calls
the refresh endpoint, and retries the original request automatically.

---

## 9. Refresh Token Rotation

Every time the refresh token is used to get a new access token, the server
does not just issue a new access token — it also issues a brand new refresh
token and immediately kills the old one.

This means:
- Each refresh token can only ever be used exactly once
- After use it is dead, replaced by a new one
- The new refresh token cookie overwrites the old one in the browser
- The new refresh token is saved in the database, replacing the old record

This is called **refresh token rotation**. It dramatically reduces the window
of opportunity for an attacker who has stolen a refresh token, because the
token they stole becomes invalid the moment the legitimate user makes any
request.

---

## 10. Reuse Detection

Reuse detection is the most important security feature in this auth system.

Here is the scenario it protects against:

An attacker somehow steals your refresh token. Maybe through a network attack,
maybe through physical access to a device. They now have a valid refresh token.

Without reuse detection, they could quietly use it in the background forever,
getting new access tokens while you continue using the app normally.

With reuse detection, the following happens:

**Scenario A — You refresh first:**
Your browser sends the refresh token, gets a new pair, and the old token is
marked dead in the database. When the attacker tries to use the old stolen
token, the server sees it does not match the current token in the database.
This is the reuse signal. The server immediately sets the user's refresh token
to null in the database, killing all sessions. Both you and the attacker
are logged out. You will need to login again, but the attacker is completely
locked out.

**Scenario B — Attacker refreshes first:**
The attacker uses the stolen token, gets a new pair. When your browser then
tries to use your (now old) token, the server again detects a mismatch.
Same result — all sessions killed, everyone logged out.

In both scenarios the attacker ends up with nothing. And you, the legitimate
user, are alerted by being forced to login again.

---

## 11. Frontend Integration Guide

This section explains how to connect your React (or any JS) frontend to this
auth system without manually managing tokens.

### Setup

Install axios for HTTP requests. All API calls should go through a single
configured axios instance, not through raw `fetch` calls scattered across
your components. This central instance is where the interceptor logic lives.

### The Axios Instance

Create one axios instance for your entire app with the following configuration:

- Set `baseURL` to your API base URL
- Set `withCredentials: true` — this is critical. Without this flag, the browser
  will not send cookies on cross-origin requests. Your auth cookies will never
  reach the server.

### Request Flow Without Interceptor

Without an interceptor, every component would need to manually handle 401
errors, call the refresh endpoint, and retry. This is unmaintainable.

### Response Interceptor

Add a response interceptor to your axios instance. This interceptor runs
automatically on every response before it reaches your component.

The interceptor should:

1. Check if the response status is 401 and the error code is `TOKEN_EXPIRED`
2. If yes, call `POST /auth/refresh` (the browser will automatically send the
   refresh token cookie)
3. If the refresh succeeds, retry the original failed request
4. If the refresh fails (refresh token also expired or revoked), redirect the
   user to the login page

This gives you completely transparent token refresh. Your components just make
API calls and never think about token expiry.

### On App Startup (Page Load / Reload)

When your app first loads, you do not know if the user has a valid session.
You should call `GET /auth/me` immediately on startup. 

- If it returns 200 — the user is logged in, set their data in your state
- If it returns 401 with `TOKEN_EXPIRED` — the interceptor will automatically
  refresh and retry, so you will still get the user data
- If it returns 401 with any other reason — no valid session, show the login page

This single call on startup is what restores the user session after a page reload.

### Logout

Call `POST /auth/logout`. The server will clear both cookies and revoke the
refresh token in the database. On the frontend, clear any user state you have
stored (in Redux, Zustand, Context, etc.) and redirect to the login page.

You do not need to manually delete cookies — the server handles that via the
`Set-Cookie` header with an expired date.

### CORS Configuration (Backend)

For cookies to work on cross-origin requests (e.g. React on port 3000 calling
API on port 5000), your Express server must have CORS configured with:

- `origin` set to your exact frontend URL (not a wildcard `*`)
- `credentials: true`

A wildcard origin with credentials is blocked by browsers for security reasons.

---

## 12. Security Protections in This Project

### httpOnly Cookies
Tokens cannot be stolen by JavaScript. XSS attacks that inject malicious JS
into your page cannot read or exfiltrate tokens.

### Secure Flag
Cookies are only transmitted over HTTPS in production. Cannot be intercepted
over plain HTTP.

### SameSite Strict
Cookies are never sent on cross-site requests. Prevents CSRF attacks where a
malicious site tricks the browser into calling your API.

### Short Access Token Lifetime (15 minutes)
Even if an access token is somehow intercepted, it is useless after 15 minutes.

### Refresh Token Rotation
Each refresh token is single-use. Stolen tokens become invalid the moment the
legitimate user makes any request.

### Reuse Detection
Any attempt to replay a used refresh token immediately kills all sessions for
that user and forces re-authentication.

### Refresh Token in Database
The refresh token is stored server-side. This means it can be revoked
instantly for any reason — security event, admin action, or user-initiated
logout from all devices.

### Generic Error Messages
The login endpoint always returns "Invalid email or password" regardless of
whether the email does not exist or the password is wrong. This prevents
user enumeration attacks where an attacker probes which email addresses are
registered in your system.

### Rate Limiting
Login and register endpoints allow a maximum of 10 attempts per IP per 15
minutes. This blocks brute force password attacks entirely.

### Input Validation
All input is validated and sanitized before reaching the database. Email
addresses are normalized. Password strength is enforced at registration.
This prevents injection attacks and ensures data integrity.

---

## 13. What Happens If a Hacker Steals a Token?

### If the access token is stolen

The attacker can make API requests on the victim's behalf for up to 15 minutes.
After that the token expires and they cannot get a new one because they do not
have the refresh token (it is in an httpOnly cookie they cannot read).

Mitigation: 15 minute expiry is the protection. Nothing more is needed.

### If the refresh token cookie is stolen

This is a more serious scenario. The attacker has a long-lived token. However:

- They cannot get the access token value itself (it is also httpOnly)
- The moment the legitimate user makes any request and the tokens rotate, the
  stolen refresh token becomes invalid
- Reuse detection ensures that even if the attacker uses it first, the
  mismatch triggers a full session wipe and the attacker ends up with nothing

### If the database is breached

If an attacker gets the raw refresh token values from the database, they could
theoretically impersonate users. This is why in the most security-critical
systems, refresh tokens are stored as bcrypt hashes in the database (just like
passwords), so the raw value is never stored anywhere.

---

## 14. API Reference

### POST /auth/register
Registers a new user. Returns user object. Sets access and refresh token cookies.
Requires: name, email, password in request body.

### POST /auth/login
Authenticates an existing user. Returns user object. Sets access and refresh
token cookies. Requires: email, password in request body.

### POST /auth/refresh
Issues a new access token using the refresh token cookie. Rotates the refresh
token. No request body needed — refresh token is read from cookie automatically.

### POST /auth/logout
Clears both token cookies and revokes the refresh token in the database.
No request body needed.

### GET /auth/me
Returns the currently authenticated user. Requires a valid access token cookie.
Used on app startup to restore session state.