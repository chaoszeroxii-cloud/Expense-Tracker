# Included by every location block in default.conf — see the note there for why these
# cannot simply be declared once at server level.
add_header X-Frame-Options        "SAMEORIGIN"                              always;
add_header X-Content-Type-Options "nosniff"                                 always;
add_header X-XSS-Protection       "1; mode=block"                           always;
add_header Referrer-Policy        "strict-origin-when-cross-origin"         always;
add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;

# Optional hardening, left off by default because it has to be verified against the
# live Google/Facebook sign-in flows before it can be trusted — an over-tight policy
# breaks login silently, in production, for everyone. Enable deliberately, then check
# the browser console on the auth page:
#
# add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' https://accounts.google.com https://connect.facebook.net; frame-src https://accounts.google.com https://www.facebook.com; connect-src 'self' https://accounts.google.com https://graph.facebook.com; form-action 'self'" always;
