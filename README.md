# AI Resume Matcher

A full-stack web application that uses Google Gemini AI to analyze resumes against job descriptions, providing an ATS-style match score and structured feedback.

## Features

* PDF resume parsing and AI analysis
* Real-time UI updates via WebSockets
* Background job processing with BullMQ and Redis
* Rate limiting for API protection
* PostgreSQL database for history tracking

## Tech Stack

* **Frontend:** React, Vite
* **Backend:** Node.js, Express, Socket.io
* **Database:** PostgreSQL
* **Queue:** Redis, BullMQ
* **AI:** Google Generative AI (Gemini 2.5 Flash)
* **Infrastructure:** Docker, Docker Compose

## Setup and Installation

1. Clone the repository
2. Create a `.env` file in the `server` directory:

GEMINI_API_KEY=your_api_key_here
PORT=5000

3. Run the application using Docker:

docker compose up --build

4. Access the frontend at `http://localhost:5173`