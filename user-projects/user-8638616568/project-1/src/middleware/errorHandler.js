const errorHandler = (err, req, res, next) => {
  console.error('[VibeForge Error]', err.stack || err);

  const statusCode = err.statusCode || err.status || 500;
  const isApiRoute = req.path.startsWith('/api');

  if (isApiRoute) {
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Internal Server Error',
      code: err.code || 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }

  res.status(statusCode).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>VibeForge • Error</title>
      <style>
        body { background: #0a0a0f; color: #fff; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .error-container { text-align: center; padding: 40px; background: rgba(255,255,255,0.05); border-radius: 16px; border: 1px solid #ff2e63; }
        h1 { color: #ff2e63; }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>VibeForge Error</h1>
        <p>${err.message || 'Something went wrong'}</p>
        <a href="/" style="color:#00f9ff">Return to Dashboard</a>
      </div>
    </body>
    </html>
  `);
};

module.exports = errorHandler;