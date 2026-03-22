import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Setup Multer to store file in memory
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription, jobTitle } = req.body;
        
        if (!req.file) return res.status(400).json({ error: "Please upload a resume" });

        // ADD THIS LINE TO DEBUG:
        console.log("File received from frontend:", req.file);

        // Convert the PDF buffer to a format Gemini can read directly
        const pdfPart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: "application/pdf"
            }
        };

        // 2. Send to Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `
            Act as an expert technical recruiter. Analyze this resume against the job description.
            Return ONLY a valid JSON object with no markdown formatting. The JSON must have two keys:
            "score": an integer from 0 to 100 representing the match percentage.
            "feedback": a short string explaining missing skills and overall fit.
            
            Job Description: ${jobDescription}
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().replace(/```json|```/g, '').trim();
        const aiAnalysis = JSON.parse(responseText);

        // 3. Save to Database
        await pool.query(
            "INSERT INTO analyses (job_title, match_score, feedback) VALUES ($1, $2, $3)",
            [jobTitle || "Untitled Job", aiAnalysis.score, aiAnalysis.feedback]
        );

        res.json(aiAnalysis);

    } catch (error) {
        console.error("Full Error : ",error);
        res.status(500).json({ error: "Analysis failed", details: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));