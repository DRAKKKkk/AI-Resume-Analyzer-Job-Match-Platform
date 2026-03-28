import express from 'express';
import multer from 'multer';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
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

const analyzeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { error: "Too many analyses requested. Please try again in 15 minutes to conserve AI quotas." },
    standardHeaders: true, 
    legacyHeaders: false,
});

router.post('/analyze', analyzeLimiter, upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription, jobTitle, companyName } = req.body;
        
        if (!req.file) return res.status(400).json({ error: "Please upload a resume" });

        const pdfPath = req.file.path;
        const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

        const mcpClient = new Client({ name: 'langchain-mcp-client', version: '1.0.0' }, { capabilities: {} });
        
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: ['server/mcp.js', '--server']
        });
        
        await mcpClient.connect(transport);
        
        const parseResumeTool = new DynamicStructuredTool({
            name: 'parse_resume',
            schema: z.object({ text: z.string() }),
            func: async ({ text }) => {
                const response = await mcpClient.request({
                    method: 'tools/call',
                    params: { name: 'parse_resume', arguments: { text } }
                }, CallToolRequestSchema);
                return response.content[0].text;
            }
        });

        const matchJobDescriptionTool = new DynamicStructuredTool({
            name: 'match_job_description',
            schema: z.object({ resumeJson: z.string(), jobDescription: z.string() }),
            func: async ({ resumeJson, jobDescription }) => {
                const response = await mcpClient.request({
                    method: 'tools/call',
                    params: { name: 'match_job_description', arguments: { resumeJson, jobDescription } }
                }, CallToolRequestSchema);
                return response.content[0].text;
            }
        });

        const llm = new ChatGoogleGenerativeAI({ modelName: 'gemini-2.5-flash', temperature: 0 });
        const tools = [parseResumeTool, matchJobDescriptionTool];
        const llmWithTools = llm.bindTools(tools);
        
        const messages = [
            new SystemMessage('You are an autonomous HR evaluation agent. Read the provided resume document. Extract its text and use the parse_resume tool to get structured data. Evaluate it against the job description using the match_job_description tool. Output ONLY a raw JSON object containing compatibilityScore and missingKeywords.'),
            new HumanMessage({
                content: [
                    { type: 'text', text: `Target Job Description: ${jobDescription}` },
                    { type: 'media', mimeType: 'application/pdf', data: pdfBase64 }
                ]
            })
        ];

        let finalResult = null;

        while (true) {
            const response = await llmWithTools.invoke(messages);
            messages.push(response);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                finalResult = response.content.replace(/```json\n?|```/g, '').trim();
                break;
            }

            for (const toolCall of response.tool_calls) {
                const selectedTool = tools.find(t => t.name === toolCall.name);
                if (selectedTool) {
                    const toolResult = await selectedTool.invoke(toolCall.args);
                    messages.push(new ToolMessage({
                        content: String(toolResult),
                        tool_call_id: toolCall.id
                    }));
                }
            }
        }

        const parsedResult = JSON.parse(finalResult);

        await pool.query(
            "INSERT INTO analyses (job_title, company_name, match_score, feedback) VALUES ($1, $2, $3, $4)",
            [jobTitle || "Untitled Job", companyName || "Unknown", parsedResult.compatibilityScore, JSON.stringify(parsedResult.missingKeywords)] 
        );

        fs.unlinkSync(pdfPath);
        res.status(200).json(parsedResult);

    } catch (error) {
        if (req.file && req.file.path) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

export default router;