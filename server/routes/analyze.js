import express from 'express';
import multer from 'multer';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pool from '../db.js';

const router = express.Router();

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

const analyzeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

router.post('/analyze', analyzeLimiter, upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription, jobTitle, companyName } = req.body;

        if (!req.file) return res.status(400).json({ error: "Please upload a resume" });

        const pdfPath = req.file.path;
        const fileBuffer = fs.readFileSync(pdfPath);
        
        const pdfPart = {
            inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType: "application/pdf"
            }
        };

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
        Act as an HR agent. Read the attached resume and evaluate it against this Job Description: ${jobDescription}. 
        Return ONLY a raw JSON object. Do NOT wrap it in markdown block quotes.
        Format: {"compatibilityScore": 85, "missingKeywords": ["AWS", "React"]}
        `;

        const result = await model.generateContent([prompt, pdfPart]);
        let responseText = result.response.text();
        
        if (!responseText) {
            responseText = '{"compatibilityScore": 0, "missingKeywords": ["Empty Response"]}';
        }

        const cleanedOutput = String(responseText).replace(/```json/gi, '').replace(/```/g, '').trim();
        
        let parsedResult;
        try {
            parsedResult = JSON.parse(cleanedOutput);
        } catch (e) {
            const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/);
            parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { compatibilityScore: 0, missingKeywords: ["Error parsing AI output"] };
        }

        await pool.query(
            "INSERT INTO analyses (job_title, company_name, match_score, feedback) VALUES ($1, $2, $3, $4)",
            [jobTitle || "Untitled", companyName || "Unknown", parsedResult.compatibilityScore || 0, JSON.stringify(parsedResult.missingKeywords || [])]
        );

        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        res.status(200).json(parsedResult);

    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: String(error.message || error) });
    }
});

export default router;