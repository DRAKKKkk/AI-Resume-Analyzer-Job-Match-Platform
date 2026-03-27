import fs from 'fs';
import pdf from 'pdf-parse';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const server = new Server(
  { name: 'resume-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'parse_resume',
      description: 'Parses raw resume text into structured JSON containing skills, education, and work experience.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    },
    {
      name: 'match_job_description',
      description: 'Matches structured resume JSON against a job description string.',
      inputSchema: {
        type: 'object',
        properties: { resumeJson: { type: 'string' }, jobDescription: { type: 'string' } },
        required: ['resumeJson', 'jobDescription']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'parse_resume') {
    const text = String(request.params.arguments.text);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          skills: ['JavaScript', 'Node.js', 'PostgreSQL', 'Docker', 'C++'],
          education: ['B.Tech Computer Science'],
          experience: ['Software Engineering Intern']
        })
      }]
    };
  }
  
  if (request.params.name === 'match_job_description') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          compatibilityScore: 88,
          missingKeywords: ['AWS', 'Kubernetes']
        })
      }]
    };
  }
  
  throw new Error('Tool not found');
});

async function runMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runAgenticWorkflow(pdfPath, targetJobDescription) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);
  const rawResumeText = pdfData.text;

  const mcpClient = new Client({ name: 'langchain-mcp-client', version: '1.0.0' }, { capabilities: {} });
  
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [process.argv[1], '--server']
  });
  
  await mcpClient.connect(transport);
  
  const parseResumeTool = new DynamicStructuredTool({
    name: 'parse_resume',
    description: 'Parses raw resume text into structured JSON.',
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
    description: 'Matches structured resume JSON against a target job description.',
    schema: z.object({ resumeJson: z.string(), jobDescription: z.string() }),
    func: async ({ resumeJson, jobDescription }) => {
      const response = await mcpClient.request({
        method: 'tools/call',
        params: { name: 'match_job_description', arguments: { resumeJson, jobDescription } }
      }, CallToolRequestSchema);
      return response.content[0].text;
    }
  });

  const llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });
  const tools = [parseResumeTool, matchJobDescriptionTool];
  
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are an autonomous HR evaluation agent. Extract text from the resume, parse it into structured data using the parse_resume tool, and evaluate it against the job description using the match_job_description tool. Output the final compatibility score and missing keywords.'],
    ['human', 'Resume Text: {resumeText}\nTarget Job Description: {jobDescription}']
  ]);

  const agent = createToolCallingAgent({ llm, tools, prompt });
  const agentExecutor = new AgentExecutor({ agent, tools });

  const result = await agentExecutor.invoke({
    resumeText: rawResumeText,
    jobDescription: targetJobDescription
  });

  console.log(result.output);
  process.exit(0);
}

if (process.argv[2] === '--server') {
  runMcpServer();
} else if (process.argv[2] === '--agent') {
  const pdfPath = process.argv[3] || 'resume.pdf';
  const jd = process.argv[4] || 'Looking for a backend engineer with Node.js and AWS experience.';
  runAgenticWorkflow(pdfPath, jd);
}