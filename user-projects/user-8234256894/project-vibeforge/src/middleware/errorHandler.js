const errorHandler = (err, req, res, next) => {
  console.error('[VibeForge Error]', new Date().toISOString(), err.stack || err);

  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Internal Server Error';

  const errorResponse = {
    success: false,
    error: {
      message: message,
      status: statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl
    }
  };

  if (statusCode === 400) {
    errorResponse.error.details = err.details || 'Invalid request data';
  }

  if (statusCode === 404) {
    errorResponse.error.message = 'Resource not found';
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;