const dotenv = require('dotenv');
dotenv.config();

const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const expectedKey = process.env.API_KEY || 'vibeforge-dev-key-2024';

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      message: 'Include X-API-Key header or apiKey query parameter'
    });
  }

  if (apiKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
      message: 'The provided API key is not authorized for this endpoint'
    });
  }

  req.authenticated = true;
  req.apiClient = 'verified-producer';
  next();
};

const validateCartRequest = (req, res, next) => {
  if (req.method === 'POST' && req.path.includes('/inquiry')) {
    const { trackId, licenseType, producerEmail } = req.body || {};

    if (!trackId || typeof trackId !== 'string' || trackId.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Invalid trackId',
        message: 'trackId must be a valid string identifier'
      });
    }

    const validLicenses = ['basic', 'premium', 'exclusive'];
    if (!licenseType || !validLicenses.includes(licenseType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid licenseType',
        message: 'licenseType must be one of: basic, premium, exclusive'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!producerEmail || !emailRegex.test(producerEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid producerEmail',
        message: 'producerEmail must be a valid email address'
      });
    }
  }
  next();
};

const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  req.rateLimit = { ip: clientIp, timestamp: Date.now() };
  next();
};

const authMiddleware = (req, res, next) => {
  validateApiKey(req, res, (err) => {
    if (err) return;
    validateCartRequest(req, res, (err) => {
      if (err) return;
      rateLimitMiddleware(req, res, next);
    });
  });
};

module.exports = {
  authMiddleware,
  validateApiKey,
  validateCartRequest,
  rateLimitMiddleware
};