# Transcendence

[![GitHub license](https://img.shields.io/github/license/ftemori/Transcendence?style=flat-square)](https://github.com/ftemori/Transcendence/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ftemori/Transcendence?style=flat-square)](https://github.com/ftemori/Transcendence/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/ftemori/Transcendence?style=flat-square)](https://github.com/ftemori/Transcendence/issues)
[![GitHub forks](https://img.shields.io/github/forks/ftemori/Transcendence?style=flat-square)](https://github.com/ftemori/Transcendence/network)

## 🌟 Overview

**Transcendence** is a captivating full-stack web application inspired by the classic Pong game, transformed into a modern, multiplayer online experience. Developed as the culminating project for the 42 School curriculum, this platform allows users to authenticate via the 42 OAuth API, engage in real-time Pong matches, chat with friends, manage profiles, compete on leaderboards, and participate in tournaments. 

The application emphasizes seamless real-time interactions, user security, and a responsive design, making it an ideal showcase of web development skills. Whether you're reminiscing about retro games or diving into competitive play, Transcendence elevates the Pong experience to new heights!

## 🚀 Features

- **Secure Authentication**: Easy sign-up and login using 42's OAuth system, with optional two-factor authentication (2FA) for enhanced security.
- **Real-Time Multiplayer Pong**: Challenge friends or random opponents in live Pong games, powered by WebSockets for smooth, lag-free gameplay.
- **Integrated Chat System**: Create public channels, send private messages, or chat directly during games—complete with emojis and notifications.
- **User Profiles & Social Features**: Customize your avatar, view match history, achievements, and stats. Add friends, block users, and manage relationships.
- **Leaderboards & Rankings**: Track global and friend-based rankings based on wins, losses, and skill levels.
- **Tournament Mode**: Organize or join structured Pong tournaments with brackets and prizes.
- **Achievements & Customization**: Unlock badges for milestones and personalize your gaming experience.
- **Responsive & Mobile-Friendly**: Enjoy the app on desktops, tablets, or mobiles with a clean, intuitive interface.

## 🛠️ Technologies Stack

- **Backend**: NestJS (Node.js framework), TypeScript, JWT for authentication.
- **Database**: PostgreSQL with Prisma ORM for efficient data management.
- **Frontend**: React.js, TypeScript, Tailwind CSS for styling, and Socket.io for real-time features.
- **Real-Time Communication**: WebSockets via Socket.io for game updates and chat.
- **Deployment & Containerization**: Docker and docker-compose for easy setup and scalability.
- **Other Tools**: OAuth 2.0, RESTful APIs, Git for version control.

This stack ensures a robust, scalable, and maintainable application, highlighting best practices in full-stack development.

## 📋 Installation Guide

### Prerequisites
- Docker and docker-compose (version 1.29+)
- Node.js (v18+) and npm (if building manually)
- 42 API credentials (Client ID and Secret) – obtain from the 42 Intranet.

### Steps
1. **Clone the Repository**:
