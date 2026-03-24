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
import fs from 'fs'; // Native Node module for File System

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// 1. Enterprise Pattern: Save files to disk instead of RAM/Queue
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// 2. Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 3. Fix Redis: Create reusable connection options (with TLS for Upstash)
const redisOpts = { 
    maxRetriesPerRequest: null,
    tls: { rejectUnauthorized: false } 
};

// 4. Fix BullMQ: Give the Queue and Worker their OWN separate connections
const resumeQueue = new Queue('resume-analysis', { 
    connection: new IORedis(process.env.REDIS_URL, redisOpts) 
});

io.on('connection', (socket) => {
    socket.on('join', (jobId) => socket.join(jobId));
});

// 5. The Worker: Reads file from disk, processes it, and cleans up!
const worker = new Worker('resume-analysis', async job => {
    const { filePath, jobDescription, jobTitle, socketRoom } = job.data;

    try {
        // Read the file directly from the hard drive
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
            Return ONLY a valid JSON object with no markdown formatting. The JSON must have two keys:
            "score": an integer from 0 to 100 representing the match percentage.
            "feedback": a short string explaining missing skills and overall fit.

            Job Description: ${jobDescription}
        `;

        const result = await model.generateContent([prompt, pdfPart]);
        const responseText = result.response.text().replace(/```json|```/g, '').trim();
        const aiAnalysis = JSON.parse(responseText);

        await pool.query(
            "INSERT INTO analyses (job_title, match_score, feedback) VALUES ($1, $2, $3)",
            [jobTitle || "Untitled Job", aiAnalysis.score, aiAnalysis.feedback]
        );

        // Send success to frontend
        io.to(socketRoom).emit('analysisComplete', aiAnalysis);

    } catch (error) {
        console.error("Worker Error:", error);
    } finally {
        // CLEANUP: Delete the file from the hard drive so the server doesn't run out of space!
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

}, { connection: new IORedis(process.env.REDIS_URL, redisOpts) });


// 6. The API Route: Saves file to disk, pushes tiny path to queue
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription, jobTitle, socketRoom } = req.body;

        if (!req.file) return res.status(400).json({ error: "Please upload a resume" });

        // Push just the file path to Redis (Tiny payload, Upstash won't block it!)
        await resumeQueue.add('analyze', {
            filePath: req.file.path, 
            jobDescription,
            jobTitle,
            socketRoom
        });

        res.status(202).json({ message: "Analysis queued" });

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Failed to queue analysis" });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));