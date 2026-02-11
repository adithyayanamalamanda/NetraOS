# 🎯 NETRA OS - Tactical Visual Assistant

<div align="center">

**An AI-powered visual assistant system designed to help visually impaired users interact with their environment through real-time object detection, voice commands, and intelligent scene understanding.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19.2-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-purple.svg)](https://vitejs.dev/)

</div>

---

## ✨ Features

### 🎥 Real-time Object Detection
- Live camera feed with AR overlay
- Automatic object identification and bounding boxes
- Smooth object tracking with position interpolation
- Visual and haptic feedback on object selection

### 🎤 Voice Command System
- Hands-free operation via voice commands
- Natural language processing for intuitive interaction
- Fuzzy matching for command recognition
- Support for multiple command phrases

### 🗣️ Text-to-Speech Engine
- Female voice with customizable pitch and rate
- Real-time subtitle display for accessibility
- Context-aware responses with tactical theme
- Support for multiple voices across platforms

### 🤖 AI-Powered Scene Understanding
- Object identification with detailed descriptions
- Safety warnings for hazardous items
- Expiry date detection for food items
- Interactive chat mode for scene questions
- Reading text from images

### 📍 Location Services
- GPS-based location identification
- Automatic location announcement on startup
- City and district level descriptions

### ⚙️ Accessibility Settings
- Adjustable speech rate (0.5x - 2.0x)
- Voice pitch control
- Label size scaling for better visibility
- High contrast HUD interface

### 🔄 Auto-Scan Mode
- Continuous environmental monitoring
- Automatic change detection
- Periodic object announcements
- Surveillance mode for constant awareness

---

## 🛠️ Tech Stack

- **Frontend**: React 19.2, TypeScript
- **Build Tool**: Vite 6.2
- **AI/ML**: Google Gemini AI (Flash 3 Preview & 2.5)
- **APIs**: 
  - Google GenAI for object detection and scene analysis
  - Web Speech API for voice recognition
  - Speech Synthesis API for text-to-speech
  - Geolocation API for location services
- **Styling**: Vanilla CSS with custom HUD design

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Google Gemini API Keys** ([Get them here](https://aistudio.google.com/apikey))
- A device with a camera (preferably rear-facing for mobile)
- Modern browser with Web Speech API support

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/adithyayanamalamanda/NetraOS.git
   cd NetraOS
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your Google Gemini API keys (comma-separated for rotation):
   ```env
   VITE_GEMINI_API_KEYS=your_api_key_1,your_api_key_2,your_api_key_3
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   
   Navigate to `http://localhost:3000`

---

## 🎮 Usage

### Initial Setup
1. **Initialize System**: Click "Initialize System" button when prompted
2. **Grant Permissions**: Allow camera and microphone access when requested
3. **Audio Setup**: The system will automatically activate audio and announce your location

### Voice Commands

| Command | Description |
|---------|-------------|
| **"Scan"** / "Look around" | Perform a manual scan of the environment |
| **"Auto scan"** / "Surveillance" | Enable continuous monitoring mode |
| **"Describe [object]"** | Get detailed analysis of a specific object |
| **"Where am I?"** / "Report location" | Get GPS-based location information |
| **"Stop"** / "Cancel" | Stop current operation or exit modes |
| **"Help"** / "Commands" | List available commands |
| **"Read this"** | Read text from the current view |

### Interactive Mode
- **Tap on objects**: Click/tap detected objects for detailed analysis
- **Chat mode**: Ask questions about what you see (automatic fallback)
- **Settings**: Tap the gear icon for accessibility adjustments

---

## 📁 Project Structure

```
NetraOS/
├── App.tsx                 # Main application component
├── index.tsx              # Application entry point
├── index.html             # HTML template
├── types.ts               # TypeScript type definitions
├── services/
│   └── geminiService.ts   # AI/ML service integration
├── components/
│   └── InfoCard.tsx       # Object detail display component
├── .env.example           # Environment variables template
├── .env.local            # Your API keys (gitignored)
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Project dependencies
```

---

## 🔒 Security

- ✅ API keys are stored in `.env.local` (gitignored)
- ✅ No sensitive data in source code
- ✅ Environment variables for all credentials
- ✅ `.env.example` provided for reference

**⚠️ Important**: Never commit `.env.local` or hardcode API keys in source files!

---

## 🎨 Customization

### HUD Theme
The interface uses a tactical/military-inspired design with cyan color scheme. Modify the CSS variables in `App.tsx` or add a custom CSS file to personalize.

### Voice Settings
Adjust voice parameters in the Settings panel:
- **Speech Rate**: Control how fast NETRA speaks
- **Voice Pitch**: Adjust voice tone
- **Label Scale**: Resize object labels

### Response Banks
Customize NETRA's responses by editing the `RESPONSES` object in `App.tsx`.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 🙏 Acknowledgments

- **Google Gemini AI** for powerful vision and language models
- **React Team** for the amazing framework
- **Vite** for blazing fast development experience
- Inspiration from tactical HUD interfaces in entertainment media

---

## 📧 Contact

**Adithya Yanamalamanda**  
GitHub: [@adithyayanamalamanda](https://github.com/adithyayanamalamanda)

---

<div align="center">

**Made with ❤️ for accessibility**

⭐ Star this repo if you find it helpful!

</div>
