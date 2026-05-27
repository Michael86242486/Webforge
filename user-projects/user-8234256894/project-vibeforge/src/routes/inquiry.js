const express = require('express');
const router = express.Router();

let inquiries = [];
let nextId = 1;

router.get('/', (req, res) => {
  res.json({
    success: true,
    count: inquiries.length,
    inquiries: inquiries.slice().reverse()
  });
});

router.post('/', (req, res) => {
  const { name, email, message, cartItems, total } = req.body;

  if (!name || !email || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Name, email, and at least one cart item are required'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }

  const inquiry = {
    id: nextId++,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    message: message ? message.trim() : '',
    cartItems: cartItems.map(item => ({
      id: item.id,
      title: item.title,
      price: parseFloat(item.price) || 0,
      license: item.license || 'standard'
    })),
    total: parseFloat(total) || cartItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0),
    status: 'pending',
    createdAt: new Date().toISOString(),
    reference: 'VIB' + Date.now().toString().slice(-8)
  };

  inquiries.push(inquiry);

  if (inquiries.length > 50) {
    inquiries.shift();
  }

  res.status(201).json({
    success: true,
    message: 'Inquiry submitted successfully. Our team will contact you within 24 hours.',
    inquiry: inquiry
  });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const inquiry = inquiries.find(i => i.id === id);

  if (!inquiry) {
    return res.status(404).json({
      success: false,
      error: 'Inquiry not found'
    });
  }

  res.json({
    success: true,
    inquiry: inquiry
  });
});

module.exports = router;