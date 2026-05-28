// public/app.js
const API_BASE = '';
const bookingForm = document.getElementById('booking-form');
const bookingGrid = document.getElementById('booking-grid');
const successModal = document.getElementById('success-modal');
const errorModal = document.getElementById('error-modal');
const modalMessage = document.getElementById('modal-message');
const closeSuccess = document.getElementById('close-success');
const closeError = document.getElementById('close-error');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');
const guestsInput = document.getElementById('guests');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const specialRequests = document.getElementById('special-requests');
const availabilitySection = document.getElementById('availability-section');
const availabilityGrid = document.getElementById('availability-grid');
const loadingSpinner = document.getElementById('loading-spinner');

let selectedSlot = null;
let currentDate = new Date().toISOString().split('T')[0];

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setMinDate();
    fetchInitialAvailability();
    setupParticles();
});

// Set minimum date to today
function setMinDate() {
    dateInput.min = currentDate;
    dateInput.value = currentDate;
}

// Setup all event listeners
function setupEventListeners() {
    bookingForm.addEventListener('submit', handleBookingSubmit);
    closeSuccess.addEventListener('click', () => successModal.classList.remove('active'));
    closeError.addEventListener('click', () => errorModal.classList.remove('active'));
    dateInput.addEventListener('change', (e) => {
        currentDate = e.target.value;
        fetchAvailability(currentDate);
    });
    timeInput.addEventListener('change', (e) => {
        if (e.target.value) {
            fetchAvailability(currentDate, e.target.value);
        }
    });
    guestsInput.addEventListener('change', (e) => {
        if (e.target.value) {
            fetchAvailability(currentDate, timeInput.value, e.target.value);
        }
    });
}

// Fetch initial availability for today
function fetchInitialAvailability() {
    showLoading(true);
    fetchAvailability(currentDate);
}

// Fetch availability from API
function fetchAvailability(date, time = '', guests = '') {
    showLoading(true);
    availabilityGrid.innerHTML = '<div class="loading-placeholder">Loading availability...</div>';

    let url = `${API_BASE}/api/availability?date=${date}`;
    if (time) url += `&time=${time}`;
    if (guests) url += `&guests=${guests}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            renderAvailability(data.slots);
            showLoading(false);
        })
        .catch(error => {
            console.error('Error fetching availability:', error);
            showError('Failed to load availability. Please try again.');
            showLoading(false);
        });
}

// Render availability slots
function renderAvailability(slots) {
    if (!slots || slots.length === 0) {
        availabilityGrid.innerHTML = '<div class="no-slots">No available slots for this date/time.</div>';
        return;
    }

    availabilityGrid.innerHTML = '';
    slots.forEach(slot => {
        const slotElement = document.createElement('div');
        slotElement.className = `availability-slot ${slot.available ? 'available' : 'unavailable'}`;
        slotElement.innerHTML = `
            <div class="slot-time">${slot.time}</div>
            <div class="slot-guests">${slot.maxGuests} guests</div>
            <div class="slot-status">${slot.available ? 'Available' : 'Booked'}</div>
        `;
        if (slot.available) {
            slotElement.addEventListener('click', () => selectSlot(slot));
        }
        availabilityGrid.appendChild(slotElement);
    });
}

// Select a time slot
function selectSlot(slot) {
    selectedSlot = slot;
    timeInput.value = slot.time;
    document.querySelectorAll('.availability-slot').forEach(el => el.classList.remove('selected'));
    event.target.closest('.availability-slot').classList.add('selected');
}

// Handle booking form submission
function handleBookingSubmit(e) {
    e.preventDefault();
    if (!selectedSlot) {
        showError('Please select an available time slot.');
        return;
    }

    const bookingData = {
        date: dateInput.value,
        time: timeInput.value,
        guests: guestsInput.value,
        name: nameInput.value,
        email: emailInput.value,
        phone: phoneInput.value,
        specialRequests: specialRequests.value
    };

    if (!validateBooking(bookingData)) return;

    showLoading(true);
    fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
    })
    .then(response => response.json())
    .then(data => {
        showLoading(false);
        if (data.success) {
            showSuccess('Your booking has been confirmed! We look forward to seeing you.');
            bookingForm.reset();
            selectedSlot = null;
            fetchAvailability(currentDate);
        } else {
            showError(data.message || 'Failed to confirm booking. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error submitting booking:', error);
        showLoading(false);
        showError('An error occurred. Please try again later.');
    });
}

// Validate booking data
function validateBooking(data) {
    if (!data.date || !data.time || !data.guests || !data.name || !data.email || !data.phone) {
        showError('Please fill in all required fields.');
        return false;
    }
    if (data.guests < 1 || data.guests > 20) {
        showError('Number of guests must be between 1 and 20.');
        return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        showError('Please enter a valid email address.');
        return false;
    }
    return true;
}

// Show success modal
function showSuccess(message) {
    modalMessage.textContent = message;
    successModal.classList.add('active');
}

// Show error modal
function showError(message) {
    modalMessage.textContent = message;
    errorModal.classList.add('active');
}

// Show/hide loading spinner
function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

// Setup particle background
function setupParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        particle.style.animationDuration = `${3 + Math.random() * 4}s`;
        particlesContainer.appendChild(particle);
    }
}

// Close modals on outside click
document.addEventListener('click', (e) => {
    if (e.target === successModal) successModal.classList.remove('active');
    if (e.target === errorModal) errorModal.classList.remove('active');
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Animate elements on scroll
const animateOnScroll = () => {
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach(el => {
        const elTop = el.getBoundingClientRect().top;
        const elVisible = 150;
        if (elTop < window.innerHeight - elVisible) {
            el.classList.add('animate');
        }
    });
};

window.addEventListener('scroll', animateOnScroll);
window.addEventListener('load', animateOnScroll);

// Dynamic CTA glow effect
const ctas = document.querySelectorAll('.cta-button');
ctas.forEach(cta => {
    cta.addEventListener('mouseenter', () => {
        cta.style.boxShadow = '0 0 20px 5px rgba(255, 68, 68, 0.6)';
    });
    cta.addEventListener('mouseleave', () => {
        cta.style.boxShadow = '0 0 10px 2px rgba(255, 68, 68, 0.4)';
    });
});

// Real-time character counter for special requests
if (specialRequests) {
    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.textContent = `${specialRequests.value.length}/200`;
    specialRequests.parentNode.insertBefore(counter, specialRequests.nextSibling);

    specialRequests.addEventListener('input', () => {
        const remaining = 200 - specialRequests.value.length;
        counter.textContent = `${specialRequests.value.length}/200`;
        counter.style.color = remaining < 20 ? '#ff4444' : '#f0f0f0';
    });
}

// Auto-format phone number input
if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        let formatted = '';
        if (value.length > 3 && value.length <= 6) {
            formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
        } else if (value.length > 6) {
            formatted = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6, 10)}`;
        } else {
            formatted = value;
        }
        e.target.value = formatted;
    });
}

// Handle window resize for responsive adjustments
window.addEventListener('resize', () => {
    if (window.innerWidth < 768) {
        availabilityGrid.classList.add('mobile-grid');
    } else {
        availabilityGrid.classList.remove('mobile-grid');
    }
});

// Initialize responsive grid
window.dispatchEvent(new Event('resize'));

module.exports = {
    fetchAvailability,
    handleBookingSubmit,
    validateBooking,
    showSuccess,
    showError
};