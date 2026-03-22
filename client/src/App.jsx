import { useState } from 'react';
import axios from 'axios';


function App() {
  const [file, setFile] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!file || !jobDescription) return alert("Please provide both a resume and a job description!");

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobTitle', jobTitle);
    formData.append('jobDescription', jobDescription);

    try {
      // Using native fetch instead of Axios for bulletproof file uploads
      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        body: formData, 
        // Notice we do NOT set the Content-Type header. The browser does it automatically with the correct boundaries!
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Analysis failed');
      }

      setResult(data);
      
    } catch (error) {
      console.error("Upload Error:", error);
      alert("Something went wrong. Check your browser's console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>AI Resume Matcher</h1>
      <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: '30px' }}>
        Upload a resume and paste a job description to see how well they match.
      </p>

      <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: '#f8f9fa', padding: '25px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        
        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Job Title</label>
          <input 
            type="text" 
            placeholder="e.g., Junior Full Stack Developer" 
            value={jobTitle} 
            onChange={(e) => setJobTitle(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Job Description</label>
          <textarea 
            placeholder="Paste the full job description here..." 
            rows="6" 
            value={jobDescription} 
            onChange={(e) => setJobDescription(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Upload Resume (PDF only)</label>
          <input 
            type="file" 
            accept="application/pdf" 
            onChange={(e) => setFile(e.target.files[0])} 
            required 
            style={{ width: '100%', padding: '10px', backgroundColor: 'white', borderRadius: '5px', border: '1px solid #ccc' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          style={{ 
            padding: '15px', 
            backgroundColor: loading ? '#95a5a6' : '#3498db', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px', 
            fontSize: '16px', 
            fontWeight: 'bold', 
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: '10px'
          }}>
          {loading ? "Analyzing with AI..." : "Analyze Match"}
        </button>
      </form>

      {/* Results Section */}
      {result && (
        <div style={{ marginTop: '30px', padding: '25px', backgroundColor: '#e8f6f3', borderRadius: '10px', borderLeft: '5px solid #1abc9c' }}>
          <h2 style={{ margin: '0 0 10px 0', color: '#16a085' }}>Match Score: {result.score}%</h2>
          <p style={{ margin: '0', fontSize: '16px', lineHeight: '1.5', color: '#2c3e50' }}>
            <strong>AI Feedback:</strong> {result.feedback}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;