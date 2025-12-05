# Weathere - Weather Forecasting with AI Sentiment Analysis 🌤️🤖

A full-stack weather application that combines real-time forecasts with AI-powered sentiment analysis of user feedback. Experience how weather predictions match real conditions through community insights and intelligent analysis.

![Weathere Demo](https://img.shields.io/badge/Demo-Live-success?style=for-the-badge)
![Open Source](https://img.shields.io/badge/Open-Source-blue?style=for-the-badge)

## ✨ Features

### 🌤️ Core Weather Features
- **Real-time forecasts** from Open-Meteo API
- **7-day and hourly** weather predictions  
- **Location search** with autocomplete
- **Weather comparison** between cities
- **Favorite locations** management
- **Responsive design** for all devices

### 💬 Advanced Feedback System
- **User authentication** with secure JWT tokens
- **Weather accuracy feedback** (Like/Dislike)
- **Comment system** with sentiment analysis
- **AI-generated summaries** of community feedback
- **Rate limiting** (one comment per hour per location)

### 🤖 Demo & Analytics
- **Automated bot comments** for demonstration
- **Real-time sentiment analysis** using OpenAI
- **Admin dashboard** with system status
- **Bot control panel** for managing demo features

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account
- OpenAI API key (optional, for AI features)
- Render.com account (for deployment)

### Installation

1. **Clone the repository**
git clone https://github.com/rjg6039/Weathere_Revise_Redo.git
cd Weathere_Revise_Redo

2. **Backend Setup**
cd backend
npm install

3. **Environment Configuration Create backend/.env:*
- MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/weathere
- OPENAI_API_KEY=your_openai_api_key_here
- JWT_SECRET=your_secure_jwt_secret_here
- NABLE_DEMO_BOTS=true
- MONGODB_DB_NAME=weathere

4. **Start Development Servers**
# Backend (Terminal 1)
cd backend
npm run dev

# Frontend - serve static files (Terminal 2)
cd frontend
# Use any static server, e.g.:
npx serve . -p 3000

## 🏗️ Architecture
Frontend (Static Site)
├── HTML/CSS/JavaScript
├── Weather data display
├── User interaction
└── API communication

Backend (Node.js/Express)
├── RESTful API
├── MongoDB database
├── User authentication
├── AI sentiment analysis
└── Bot scheduler

External Services
├── Open-Meteo (Weather data)
├── MongoDB Atlas (Database)
├── OpenAI (AI analysis)
└── Render.com (Hosting)

## 📡 API Endpoints
### Authentication
- POST /api/auth/register - User registration
- POST /api/auth/login - User login
### Weather & Feedback
- GET /api/feedback/summary - Get feedback for location
- POST /api/feedback - Submit weather feedback
- GET /api/user/favorites - Get user favorites
- POST /api/user/favorites/toggle - Toggle favorite
### Admin & Bots
- GET /api/health - System status
- GET /api/scripts/seed-bots - Seed demo bots
- GET /api/bots/status - Bot system status
- POST /api/bots/control - Control bot scheduler

## 🎯 Usage Guide
### For End Users
1. View Weather: Visit the main page to see current conditions
2. Search Locations: Use the search bar to find any city worldwide
3. Provide Feedback: Sign in to rate forecast accuracy and comment
4. Save Favorites: Click the star icon to save frequently viewed locations
5. Compare Weather: Use the comparison feature to see differences between cities

### For Demo Purposes
1. Visit Admin Panel: Go to /admin.html to check system status
2. Seed Demo Bots: Use /seed-bots.html to create automated test users
3. Monitor AI Analysis: Watch the AI summary update as feedback accumulates

## 🔧 Configuration
Environment Variables
Variable	Purpose	Required
MONGODB_URI	Database connection	✅
JWT_SECRET	Authentication security	✅
OPENAI_API_KEY	AI sentiment analysis	❌ (Optional)
ENABLE_DEMO_BOTS	Automated demo system	❌

## Bot System Configuration
The demo bot system can be configured through:

Frequency: Adjust how often bots comment (2 minutes default)
Activation: Enable/disable bot system dynamically
Content: Customize bot comment patterns in server.js

## 🌐 Deployment
### Render.com Deployment
Backend Service (Web Service)

- Build Command: npm install
- Start Command: npm start
- Environment: Node.js
- Root Directory: backend

Frontend Service (Static Site)
- Build Command: (empty)
- Publish Directory: frontend
- Environment: Static

Environment Variables on Render
Set these in your Render dashboard:

MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=secure_random_string
OPENAI_API_KEY=sk-...your_openai_key
ENABLE_DEMO_BOTS=true


## 🧪 Testing
### Test Cases Included
1. User Feedback System - Comment submission and validation
2. Authentication Flow - Registration and login processes
3. Weather Data Integration - API connectivity and error handling
4. Bot System Operations - Automated comment generation
5. System Resilience - Error handling and graceful degradation

### Running Tests
Manual testing scenarios are documented in the project wiki covering:
- Input validation boundaries
- API error conditions
- User experience flows
- System integration points


## 🤝 Contributing
We welcome contributions! Please see our contributing guidelines for:
- Bug reports
- Feature requests

## 📄 License
This project is licensed under the MIT License - see the LICENSE [blocked] file for details.

## 🆘 Support
- Documentation: Check this README and code comments
- Issues: Use GitHub Issues for bug reports
- Discussions: GitHub Discussions for questions
- Demo Site: Visit the live deployment for working examples

## 🔮 Roadmap
 - Enhanced mobile experience
 - Additional weather data sources
 - Advanced AI analysis features
 - Social features and user profiles
 - Historical weather pattern analysis

### Built with ❤️ using modern web technologies and AI integration.

Weather data provided by Open-Meteo
AI analysis powered by OpenAI

## 📁 Project Structure
weathere-open-source/
├── frontend/                 # Static frontend files
│   ├── index.html           # Main application
│   ├── admin.html           # System status dashboard
│   ├── seed-bots.html       # Bot management panel
│   ├── css/                 # Stylesheets
│   └── js/                  # JavaScript functionality
├── backend/                 # Node.js backend
│   ├── server.js           # Main server file
│   ├── package.json        # Dependencies
│   └── scripts/            # Utility scripts
├── README.md               # This file
└── LICENSE                 # MIT License

Quick Start Tip: Visit the live demo at www.weathere4-frontend.onrender.com to see the application in action before setting up your own instance!
