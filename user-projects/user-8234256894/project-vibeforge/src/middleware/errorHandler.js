const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const timestamp = new Date().toISOString();

  console.error(`[${timestamp}] ERROR: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }

  const errorResponse = {
    success: false,
    error: {
      message: isProduction && statusCode === 500 
        ? 'An unexpected error occurred. Please try again later.' 
        : err.message || 'Internal Server Error',
      status: statusCode,
      timestamp: timestamp,
      path: req.originalUrl,
      method: req.method
    }
  };

  if (!isProduction) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details || null;
  }

  if (err.name === 'ValidationError') {
    errorResponse.error.message = 'Validation failed';
    errorResponse.error.fields = err.errors || {};
  }

  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Invalid CSRF token',
        status: 403,
        timestamp: timestamp
      }
    });
  }

  if (statusCode === 404) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Resource not found',
        status: 404,
        path: req.originalUrl,
        timestamp: timestamp
      }
    });
  }

  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;