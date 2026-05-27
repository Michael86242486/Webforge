const express = require('express');
const router = express.Router();

function validateInquiry(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    errors.push('Request body must be a valid object');
    return errors;
  }
  if (!.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push('Name is required and must be at least 2 characters');
  }
  if (!body.email || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push('Valid email address is required');
  }
  if (!body.trackIds || !Array.isArray(body.trackIds) || body.trackIds.length === 0) {
    errors.push('At least one track ID must be selected');
  }
  if (body.message && typeof body.message === 'string' && body.message.length > 500) {
    errors.push('Message cannot exceed 500 characters');
  }
  if (body.budget && (typeof body.budget !== 'number' || body.budget < 0)) {
    errors.push('Budget must be a positive number');
  }
  return errors;
}

router.post('/', (req, res, next) => {
  try {
    const validationErrors = validateInquiry(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
    }

    const inquiry = {
      id: 'inq_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      name: req.body.name.trim(),
      email: req.body.email.toLowerCase().trim(),
      trackIds: req.body.trackIds,
      message: req.body.message ? req.body.message.trim() : '',
      budget: req.body.budget || null,
      timestamp: new Date().toISOString(),
      status: 'received'
    };

    console.log('[VibeForge] New cart inquiry received:', inquiry.id);

    res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully. Our team will contact you within 24 hours.',
      inquiry: inquiry
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Inquiry endpoint is active. Use POST to submit cart inquiries.'
  });
});

module.exports = router;