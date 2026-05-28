const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  console.error(`[VibeForge Error] ${new Date().toISOString()}`);
  console.error(`Status: ${statusCode}`);
  console.error(`Path: ${req.method} ${req.originalUrl}`);
  console.error(`Message: ${err.message}`);
  if (err.stack && !isProduction) {
    console.error(err.stack);
  }

  const errorResponse = {
    success: false,
    error: {
      message: isProduction 
        ? 'An unexpected error occurred. Please try again later.' 
        : err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  };

  if (!isProduction) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details || null;
  }

  if (err.name === 'ValidationError') {
    errorResponse.error.code = 'VALIDATION_ERROR';
    res.status(400).json(errorResponse);
    return;
  }

  if (err.name === 'UnauthorizedError') {
    errorResponse.error.code = 'UNAUTHORIZED';
    res.status(401).json(errorResponse);
    return;
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;