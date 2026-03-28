import fs from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

const server = new Server(
  { name: 'resume-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'parse_resume',
      description: 'Parses raw resume text into structured JSON.',
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
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

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

  const llm = new ChatGoogleGenerativeAI({ modelName: 'gemini-2.5-flash', temperature: 0 });
  const tools = [parseResumeTool, matchJobDescriptionTool];
  const llmWithTools = llm.bindTools(tools);
  
  const messages = [
    new SystemMessage('You are an autonomous HR evaluation agent. Read the provided resume document. First, extract its text and use the parse_resume tool to get structured data. Then, evaluate it against the job description using the match_job_description tool. Output the final compatibility score and missing keywords.'),
    new HumanMessage({
      content: [
        {
          type: 'text',
          text: `Target Job Description: ${targetJobDescription}`
        },
        {
          type: 'media',
          mimeType: 'application/pdf',
          data: pdfBase64
        }
      ]
    })
  ];

  while (true) {
    const response = await llmWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(response.content);
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

  process.exit(0);
}

if (process.argv[2] === '--server') {
  runMcpServer();
} else if (process.argv[2] === '--agent') {
  const pdfPath = process.argv[3] || 'resume.pdf';
  const jd = process.argv[4] || 'Looking for a backend engineer with Node.js and AWS experience.';
  runAgenticWorkflow(pdfPath, jd);
}