const errorHandler = (err, req, res, next) => {
  console.error(`[VibeForge Error] ${new Date().toISOString()}:`, err.stack || err.message);

  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  const errorResponse = {
    success: false,
    message: err.message || 'An unexpected error occurred on the VibeForge platform',
    error: isProduction ? 'Internal Server Error' : err.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  };

  if (req.path.startsWith('/api/')) {
    return res.status(statusCode).json(errorResponse);
  }

  res.status(statusCode).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>VibeForge • Error</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&amp;family=Space+Grotesk:wght@500;600&amp;display=swap');
        body { background: #0a0a0f; color: #fff; font-family: 'Inter', system_ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .error-container { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,0,136,0.3); border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; }
        .neon-text { background: linear-gradient(90deg, #ff0088, #00f3ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 2.5rem; font-weight: 700; }
        .status { font-family: 'Space Grotesk', sans-serif; font-size: 4rem; font-weight: 600; color: #ff0088; margin: 0; }
      </style>
    </head>
    <body>
      <div class="error-container">
        <div class="status">${statusCode}</div>
        <h1 class="neon-text">VibeForge</h1>
        <p style="color:#aaa; margin:24px 0 32px;">${errorResponse.message}</p>
        <a href="/" style="color:#00f3ff; text-decoration:none; font-weight:600;">Return to Dashboard →</a>
      </div>
    </body>
    </html>
  `);
};

module.exports = errorHandler;