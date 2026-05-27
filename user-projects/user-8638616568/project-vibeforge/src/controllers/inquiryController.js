const inquiryController = {
  validateInquiry: function(data) {
    const errors = [];
    if (!data || typeof data !== 'object') {
      errors.push('Invalid request payload');
      return { valid: false, errors };
    }
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
      errors.push('Name must be at least 2 characters');
    }
    if (!data.email || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Valid email address required');
    }
    if (!data.trackId || typeof data.trackId !== 'string' || data.trackId.trim().length === 0) {
      errors.push('Track ID is required');
    }
    if (!data.quantity || typeof data.quantity !== 'number' || data.quantity < 1 || data.quantity > 50) {
      errors.push('Quantity must be between 1 and 50');
    }
    if (!data.message || typeof data.message !== 'string' || data.message.trim().length < 10) {
      errors.push('Message must be at least 10 characters');
    }
    return { valid: errors.length === 0, errors };
  },

  formatInquiryResponse: function(inquiry, status) {
    const timestamp = new Date().toISOString();
    const inquiryId = 'INQ-' + Date.now().toString(36).toUpperCase();
    
    if (status === 'success') {
      return {
        success: true,
        inquiryId,
        timestamp,
        message: 'Inquiry received successfully. Our team will contact you within 24 hours.',
        data: {
          name: inquiry.name.trim(),
          email: inquiry.email.toLowerCase(),
          trackId: inquiry.trackId.trim(),
          quantity: inquiry.quantity,
          licenseType: inquiry.licenseType || 'standard',
          total: (inquiry.quantity * 49.99).toFixed(2),
          status: 'pending_review'
        }
      };
    }
    
    return {
      success: false,
      inquiryId: null,
      timestamp,
      message: 'Inquiry submission failed',
      errors: inquiry.errors || ['Unknown error occurred']
    };
  },

  processInquiry: function(req, res) {
    const validation = this.validateInquiry(req.body);
    
    if (!validation.valid) {
      return res.status(400).json(
        this.formatInquiryResponse({ errors: validation.errors }, 'error')
      );
    }

    const formattedResponse = this.formatInquiryResponse(req.body, 'success');
    return res.status(201).json(formattedResponse);
  }
};

module.exports = inquiryController;