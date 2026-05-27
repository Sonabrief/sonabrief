interface Env {
  MAINTENANCE_MODE?: string;
}

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sonabrief — Manutenzione</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      text-align: center;
      max-width: 480px;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #fff;
    }
    p {
      font-size: 1rem;
      color: #a1a1aa;
      line-height: 1.6;
    }
    a {
      color: #818cf8;
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Sonabrief è in manutenzione</h1>
    <p>Lancio pubblico imminente.<br/>
    Per accesso anticipato: <a href="mailto:sonabrief.app@gmail.com">sonabrief.app@gmail.com</a></p>
  </div>
</body>
</html>`;

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  if (env.MAINTENANCE_MODE === "true") {
    return new Response(MAINTENANCE_HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Retry-After": "3600",
      },
    });
  }
  return next();
};
