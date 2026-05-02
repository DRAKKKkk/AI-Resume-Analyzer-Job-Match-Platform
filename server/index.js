import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io'; // 1. IMPORT SOCKET.IO
import pool from './db.js';
import analyzeRouter from './routes/analyze.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// 2. INITIALIZE SOCKET.IO ON THE HTTP SERVER
const io = new Server(server, {
  cors: {
    origin: "*", // You can restrict this to your Vercel URL later for security
    methods: ["GET", "POST"]
  }
});

// 3. LISTEN FOR CONNECTIONS (Helpful for debugging)
io.on('connection', (socket) => {
  console.log('A client connected via socket:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 4. MAKE 'io' AVAILABLE TO YOUR ROUTES (Crucial if analyze.js emits events)
app.set('io', io);

app.use(cors());
app.use(express.json());

app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM analyses ORDER BY id DESC LIMIT 20");
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    job_title VARCHAR(255),
    company_name VARCHAR(255),
    match_score INTEGER,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

app.get('/', (req, res) => {
    res.status(200).send('API is running');
});

app.use('/api', analyzeRouter);

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));