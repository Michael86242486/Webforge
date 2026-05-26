const express = require('express');
const router = express.Router();

function validateCartItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.id || typeof item.id !== 'string') return false;
  if (!item.title || typeof item.title !== 'string' || item.title.length < 2) return false;
  if (typeof item.price !== 'number' || item.price <= 0) return false;
  if (typeof item.quantity !== 'number' || item.quantity < 1 || item.quantity > 10) return false;
  if (item.license && !['standard', 'exclusive', 'lease'].includes(item.license)) return false;
  return true;
}

function validateInquiryPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('Invalid request payload');
    return { valid: false, errors };
  }
  if (!payload.email || typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('Valid email address is required');
  }
  if (!payload.name || typeof payload.name !== 'string' || payload.name.length < 2) {
    errors.push('Full name is required');
  }
  if (!Array.isArray(payload.cart) || payload.cart.length === 0) {
    errors.push('Cart must contain at least one item');
  } else {
    payload.cart.forEach((item, index) => {
      if (!validateCartItem(item)) {
        errors.push(`Invalid cart item at position ${index + 1}`);
      }
    });
  }
  if (payload.message && typeof payload.message !== 'string') {
    errors.push('Message must be a string');
  }
  if (payload.message && payload.message.length > 2000) {
    errors.push('Message cannot exceed 2000 characters');
  }
  return { valid: errors.length === 0, errors };
}

function calculateInquiryTotal(cart) {
  return cart.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);
}

router.post('/', (req, res, next) => {
  try {
    const validation = validateInquiryPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }
    const { email, name, cart, message, licenseType } = req.body;
    const inquiryId = 'INQ-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    const total = calculateInquiryTotal(cart);
    const inquiryRecord = {
      inquiryId,
      timestamp: new Date().toISOString(),
      customer: { name, email },
      cart: cart.map(item => ({
        id: item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        license: item.license || 'standard'
      })),
      total,
      message: message || '',
      licenseType: licenseType || 'standard',
      status: 'received'
    };
    console.log('[VibeForge] New cart inquiry received:', inquiryId);
    res.status(201).json({
      success: true,
      inquiryId,
      total,
      message: 'Inquiry submitted successfully. Our team will contact you within 24 hours.',
      record: inquiryRecord
    });
  } catch (err) {
    next(err);
  }
});

router.get('/validate', (req, res) => {
  res.json({
    success: true,
    message: 'Inquiry validation endpoint active',
    rules: {
      required: ['email', 'name', 'cart'],
      cartItem: ['id', 'title', 'price', 'quantity'],
      limits: { quantity: { min: 1, max: 10 }, message: 2000 }
    }
  });
});

module.exports = router;