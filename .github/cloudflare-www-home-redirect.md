# Cloudflare Redirect Rule: `/home` → `/` (www only)

Production is **GitHub Pages** (`CNAME` `www.hongzhtaichina.com`) behind Cloudflare.
GitHub Pages cannot emit an HTTP 301 from a static file. `vercel.json` redirects do
not apply to this origin.

Do **not** restore `home/index.html`. That path was a **200** meta-refresh/JS page
(“Redirecting to Homepage”), which Search Console treats as a crawlable URL.

## Rule to apply in the Cloudflare dashboard

Zone: `hongzhtaichina.com`  
Product: **Rules** → **Redirect Rules** → Create rule  
Placement: a **Single Redirect** that runs on the www hostname only

| Field | Value |
|---|---|
| Rule name | `www /home to homepage` |
| When incoming requests match | Custom filter expression |
| Expression | `(http.host eq "www.hongzhtaichina.com" and (http.request.uri.path eq "/home" or http.request.uri.path eq "/home/" or http.request.uri.path eq "/home/index.html"))` |
| Then | **Static** URL redirect |
| Target URL | `https://www.hongzhtaichina.com/` |
| Status | **301** |
| Preserve query string | On |

Do **not** match `api.hongzhtaichina.com` or any other hostname. Do **not** use a
wildcard like `*hongzhtaichina.com/home*`.

## After the rule is live

```bash
curl -sI https://www.hongzhtaichina.com/home
curl -sI https://www.hongzhtaichina.com/home/
curl -sI https://www.hongzhtaichina.com/home/index.html
```

Both must end at `https://www.hongzhtaichina.com/` with **301**. Neither may return
**200** HTML. `/home/index.html` must end at the same URL with **301**.
`/home/index.html` is included because that exact path stayed HTTP 404 after `/home` and `/home/` were redirected. Do not restore `home/index.html`.
