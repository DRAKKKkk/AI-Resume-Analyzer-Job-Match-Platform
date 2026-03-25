import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from './db.js';
import { Queue, Worker } from 'bullmq';
import { Server } from 'socket.io';
import http from 'http';
import IORedis from 'ioredis';
import fs from 'fs';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDFs are allowed'));
    }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const redisOpts = { 
    maxRetriesPerRequest: null
};

if (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('rediss')) {
    redisOpts.tls = { rejectUnauthorized: false };
}

const resumeQueue = new Queue('resume-analysis', { 
    connection: new IORedis(process.env.REDIS_URL, redisOpts) 
});

io.on('connection', (socket) => {
    socket.on('join', (jobId) => socket.join(jobId));
});

const worker = new Worker('resume-analysis', async job => {
    const { filePath, jobDescription, jobTitle, companyName, socketRoom } = job.data;

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const pdfPart = {
            inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType: "application/pdf"
            }
        };

       const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `
            Act as an expert technical recruiter. Analyze the attached PDF resume against the job description below.
            Return ONLY a valid JSON object. No markdown.
            Format strictly like this:
            {
                "score": 80,
                "feedback": [
                    { "section": "OVERALL FIT", "points": ["Under 15 words bullet.", "Another short bullet."] },
                    { "section": "SKILLS", "points": ["Under 15 words bullet.", "Another short bullet."] },
                    { "section": "PROJECTS", "points": ["Under 15 words bullet."] },
                    { "section": "EDUCATION", "points": ["Under 15 words bullet."] }
                ]
            }
            Keep every point strictly under 15 words. Brutally brief.

            Job Description: ${jobDescription}
        `;

        const result = await model.generateContent([prompt, pdfPart]);
        const responseText = result.response.text().replace(/```json|```/g, '').trim();
        const aiAnalysis = JSON.parse(responseText);

        await pool.query(
            "INSERT INTO analyses (job_title, company_name, match_score, feedback) VALUES ($1, $2, $3, $4)",
            [jobTitle || "Untitled Job", companyName || "Unknown", aiAnalysis.score, JSON.stringify(aiAnalysis.feedback)] 
        );

        io.to(socketRoom).emit('analysisComplete', aiAnalysis);

    } catch (error) {
        console.error(error);
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}, { connection: new IORedis(process.env.REDIS_URL, redisOpts) });

const analyzeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { error: "Too many analyses requested. Please try again in 15 minutes to conserve AI quotas." },
    standardHeaders: true, 
    legacyHeaders: false,
});

app.post('/api/analyze', analyzeLimiter, upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription, jobTitle, companyName, socketRoom } = req.body;

        if (!req.file) return res.status(400).json({ error: "Please upload a resume" });

        await resumeQueue.add('analyze', {
            filePath: req.file.path, 
            jobDescription,
            jobTitle,
            companyName,
            socketRoom
        });

        res.status(202).json({ message: "Analysis queued" });

    } catch (error) {
        res.status(500).json({ error: "Failed to queue analysis" });
    }
});

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

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));