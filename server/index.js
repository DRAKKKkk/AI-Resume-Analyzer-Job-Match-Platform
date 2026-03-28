import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import pool from './db.js';
import analyzeRouter from './routes/analyze.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

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