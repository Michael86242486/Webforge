const express = require('express');
const router = express.Router();

function validateInquiry(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Invalid request body');
    return errors;
  }
  if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Valid email address is required');
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('Cart must contain at least one track');
  } else {
    data.items.forEach((item, index) => {
      if (!item.id || typeof item.id !== 'string') {
        errors.push(`Item ${index + 1}: Track ID is required`);
      }
      if (!item.title || typeof item.title !== 'string') {
        errors.push(`Item ${index + 1}: Track title is required`);
      }
      if (typeof item.price !== 'number' || item.price <= 0) {
        errors.push(`Item ${index + 1}: Valid price is required`);
      }
    });
  }
  if (data.message && typeof data.message !== 'string') {
    errors.push('Message must be a string');
  }
  if (data.message && data.message.length > 500) {
    errors.push('Message cannot exceed 500 characters');
  }
  return errors;
}

router.post('/', (req, res, next) => {
  try {
    const errors = validateInquiry(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }
    const inquiryId = 'INQ-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const total = req.body.items.reduce((sum, item) => sum + item.price, 0);
    const inquiry = {
      id: inquiryId,
      email: req.body.email,
      items: req.body.items,
      message: req.body.message || '',
      total: parseFloat(total.toFixed(2)),
      status: 'pending',
      createdAt: new Date().toISOString(),
      estimatedResponse: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    console.log('[VibeForge] New cart inquiry received:', inquiryId);
    res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully. Our team will contact you within 24 hours.',
      inquiry: inquiry
    });
  } catch (err) {
    next(err);
  }
});

router.get('/status/:id', (req, res) => {
  const inquiryId = req.params.id;
  if (!inquiryId || !inquiryId.startsWith('INQ-')) {
    return res.status(400).json({ success: false, error: 'Invalid inquiry ID' });
  }
  res.json({
    success: true,
    inquiry: {
      id: inquiryId,
      status: 'in_progress',
      updatedAt: new Date().toISOString()
    }
  });
});

module.exports = router;