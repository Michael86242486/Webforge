# Restaurant Booking Site

## Table of Contents

*   [Overview](#overview)
*   [Tech Stack](#tech-stack)
*   [Live URL](#live-url)
*   [Files Included](#files-included)
*   [Getting Started](#getting-started)
*   [API Endpoints](#api-endpoints)
*   [Contributing](#contributing)
*   [License](#license)

## Overview

A restaurant booking site built using Node.js and Express, providing a user-friendly interface for customers to book tables and view availability.

## Tech Stack

*   **Backend**: Node.js and Express for building the RESTful API
*   **Frontend**: Static HTML served by the Express server

## Live URL

https://3d8ada41-cad9-48ff-b083-43500b50650f-00-2b41yra3glxyn.picard.replit.dev/api/preview-proxy/tableturn/

## Files Included

*   `package.json` — Node.js manifest with dependencies and start script
*   `src/index.js` — Express server, binds to 0.0.0.0 on `process.env.PORT`, serves static files
*   `src/routes/bookings.js` — API routes for booking logic and availability checks
*   `src/middleware/validation.js` — Request validation for booking data
*   `public/index.html` — Main HTML with dark theme, meta tags, and semantic structure

## Getting Started

1.  Clone the repository using `git clone <repository-url>`
2.  Install dependencies using `npm install`
3.  Start the server using `npm start`
4.  Access the site at `http://localhost:port` (default port is 3000)

## API Endpoints

Refer to the `src/routes/bookings.js` file for a list of available API endpoints.

## Contributing

Contributions are welcome and encouraged. Please submit pull requests against the `main` branch.

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).