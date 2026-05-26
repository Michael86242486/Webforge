const errorHandler = (err, req, res, next) => {
  console.error(`[VibeForge Error] ${new Date().toISOString()}:`, err.stack || err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'An unexpected error occurred on the VForge platform';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Invalid request data provided';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Authentication required to access this resource';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    message = 'External service temporarily unavailable';
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const response = {
    success: false,
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    }
  };

  if (!isProduction) {
    response.error.stack = err.stack;
    response.error.details = err.details || null;
  }

  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(statusCode).json(response);
  }

  res.status(statusCode).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>VibeForge • Error</title>
      <style>
        body { background: #0a0a0f; color: #fff; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .error-container { background: rgba(255,255,255,0.05); border: 1px solid #ff2d95; padding: 40px; border-radius: 16px; max-width: 520px; text-align: center; }
        h1 { color: #ff2d95; margin: 0 0 16px; }
        p { color: #a1a1aa; }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>VibeForge Error</h1>
        <p>${message}</p>
        <p style="font-size:0.85rem;margin-top:24px;">Error code: ${statusCode} • ${new Date().toISOString()}</p>
      </div>
    </body>
    </html>
  `);
};

module.exports = errorHandler;