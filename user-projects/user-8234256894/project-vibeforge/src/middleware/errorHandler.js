const errorHandler = (err, req, res, next) => {
  console.error('[VibeForge Error]', new Date().toISOString(), err.stack || err);
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const errorResponse = {
    success: false,
    error: {
      message: statusCode === 500 
        ? 'Internal server error. Our team has been notified.' 
        : err.message || 'An unexpected error occurred',
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  };
  if (!isProduction) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details || null;
  }
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        fields: err.fields || {}
      }
    });
    return;
  }
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'UNAUTHORIZED'
      }
    });
    return;
  }
  res.status(statusCode).json(errorResponse);
};
module.exports = errorHandler;