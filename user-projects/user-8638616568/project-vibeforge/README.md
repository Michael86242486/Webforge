# VibeForge

VibeForge is a premium, retro-neon themed portfolio and monetization platform tailored for independent music producers. Showcase your tracks, engage with fans, and facilitate inquiries seamlessly through a stylish and interactive interface.

---

## Features

- **Retro-Neon Design**: A visually stunning HTML5 frontend with high-end neon CSS animations that captivate visitors.
- **Embedded Audio Player**: Custom-built audio preview player for tracks directly on your portfolio.
- **Interactive Shopping Cart**: Sidebar cart allowing users to select tracks and send inquiries, integrated with the backend API.
- **Secure API Endpoints**: Backend API for handling inquiries and streaming a mock track catalog.

---

## Requirements

### Backend

- **Technology**: Node.js + Express
- **API Endpoints**:
  - **Inquiry API**: Secure endpoint to handle shopping cart inquiries.
  - **Track Catalog Streaming**: Route to stream mock track data.
- **Server Binding**: Use `app.listen(PORT, '0.0.0.0')` to explicitly bind the server.

### Frontend

- **Design**: HTML5 interface with retro-neon CSS animations.
- **Audio**: Custom embedded audio preview player.
- **Interaction**: Sidebar shopping cart that communicates with backend inquiry API.

### Structure

- Modular layout separating:
  - **Public assets** (CSS, images, scripts)
  - **Routes** (API endpoints, frontend routes)
  - **Server logic**

---

## Getting Started

### Prerequisites

- Node.js v14+ installed

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/vibeforge.git
cd vibeforge
```

2. Install dependencies:

```bash
npm install
```

### Running the Application

- Start the backend server:

```bash
node server.js
```

- Access the frontend by opening `index.html` in your preferred browser or configuring a local server as needed.

---

## Usage

- Browse the portfolio with neon animations.
- Preview tracks using the embedded player.
- Add tracks to the sidebar cart.
- Send inquiries directly through the cart interface, which communicates with the backend API.

---

## License

This project is licensed under the MIT License. See `LICENSE` for more details.

---

## Acknowledgments

- Inspired by retro-neon aesthetics and modern web development best practices.
- Special thanks to the open-source community for CSS animations and audio player components.

---

*For questions or contributions, please open an issue or submit a pull request.*