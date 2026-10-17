# 🎮 MilioTracker

**MilioTracker** is a desktop companion and in-game overlay for **League of Legends**, focused on players using **Milio Support**.

Built with **Electron, Node.js and JavaScript**, the application reads live match information and presents useful macro, vision and performance data without interrupting gameplay.

<p align="center">
  <img src="assets/screenshots/second-monitor.png" alt="MilioTracker running alongside League of Legends" width="950">
</p>

---

## ✨ Features

### 🎯 In-game Support Overlay

A compact overlay designed to remain visible during the match and provide useful information without taking focus away from gameplay.

Features include:

- Live game timer
- Current gold
- Champion level
- Ranked information
- Vision control checklist
- Control Ward reminder
- Oracle Lens reminder
- Objective preparation
- Support macro guidance

---

### 🖥️ Second Monitor Dashboard

A dedicated dashboard designed for players using a second monitor.

It provides quick access to:

- Milio rune setup
- Skill order from level 1 to 18
- Objective timeline
- Scuttle Crab timing
- Dragon timing
- Void Grubs timing
- Baron timing
- Gold goals
- Support item progression
- Vision preparation checklist
- KDA and CS information

---

### 📡 Live Match Integration

MilioTracker reads information from the **League of Legends Live Client Data API** while a match is running.

The application dynamically updates match information such as:

- Game time
- Gold
- Champion level
- Match state

This allows the interface to react to the current game without requiring the player to manually update the application.

---

## 📸 Screenshots

### In-game Overlay

<p align="center">
  <img src="assets/screenshots/overlay-ingame.png" width="320" alt="MilioTracker in-game overlay">
</p>

### Second Monitor Dashboard

<p align="center">
  <img src="assets/screenshots/dashboard.png" width="900" alt="MilioTracker second monitor dashboard">
</p>

### Full Setup

<p align="center">
  <img src="assets/screenshots/second-monitor.png" width="950" alt="MilioTracker full setup with League of Legends">
</p>

---

## 🛠️ Technologies

- JavaScript
- Electron
- Node.js
- HTML5
- CSS3
- League of Legends Live Client Data API
- Git
- GitHub

---

## 🚀 Running the Project

### Prerequisites

Make sure you have installed:

- [Node.js](https://nodejs.org/)
- npm
- League of Legends

### Clone the repository

```bash
git clone https://github.com/Ludloop/MilioTracker.git
```

### Enter the project directory

```bash
cd MilioTracker
```

### Install dependencies

```bash
npm install
```

### Start the application

```bash
npm start
```

For live match information, League of Legends must be running with an active game.

---

## 📁 Project Structure

```text
MilioTracker/
├── assets/
│   └── screenshots/
├── build/
├── src/
├── test/
├── dashboard.html
├── dashboard.js
├── dashboard-preload.js
├── index.html
├── main.js
├── preload.js
├── renderer.js
├── riot-pre-game-controller.js
├── ward-overlay.html
├── ward-overlay.js
├── ward-preload.js
├── style.css
├── package.json
└── package-lock.json
```

---

## 🎯 Project Goals

MilioTracker was created as a practical software development project combining game data, desktop development and interface design.

The project allowed me to work with:

- Desktop application development with Electron
- JavaScript and Node.js
- Real-time game data
- API integration
- Multi-window desktop interfaces
- Overlay interfaces
- UI/UX design
- Game companion tools
- Git and GitHub
- Software testing and project organization

The application was developed from the initial concept to a functional desktop project capable of interacting with a live League of Legends match.

---

## 💡 Why MilioTracker?

Support players need to manage several pieces of information simultaneously:

- Vision
- Objective timers
- Rotations
- Item progression
- Map awareness
- Champion progression

MilioTracker centralizes these reminders and information in a dedicated interface so the player can focus more on decision-making during the match.

---

## 👩‍💻 Author

**Ludmila Lopes**

Analysis and Systems Development student focused on software development, desktop applications and web technologies.

Main technologies and areas of study:

`JavaScript` • `Java` • `Python` • `Electron` • `Node.js` • `Linux` • `Git`

GitHub: [@Ludloop](https://github.com/Ludloop)

---

## ⚠️ Disclaimer

MilioTracker is an independent personal project.

It is not endorsed by, affiliated with, or sponsored by Riot Games.

**League of Legends** and **Riot Games** are trademarks or registered trademarks of Riot Games, Inc.
