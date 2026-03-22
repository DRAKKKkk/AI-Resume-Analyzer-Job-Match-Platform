import { useState } from 'react';
import axios from 'axios';
import './App.css'; // You can add basic styles here

function App() {
  const [file, setFile] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!file || !jobDescription) return alert("Please provide both file and job description");

    setLoading(true);
    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobTitle', jobTitle);
    formData.append('jobDescription', jobDescription);

    try {
      const response = await axios.post('http://localhost:5000/api/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(response.data);
    } catch (error) {
      console.error(error);
      alert("Error analyzing resume. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>AI Resume & Job Matcher</h1>
      
      <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="Job Title" 
          value={jobTitle} 
          onChange={(e) => setJobTitle(e.target.value)} 
          required 
        />
        
        <textarea 
          placeholder="Paste Job Description Here..." 
          rows="6" 
          value={jobDescription} 
          onChange={(e) => setJobDescription(e.target.value)} 
          required 
        />
        
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={handleFileChange} 
          required 
        />
        
        <button type="submit" disabled={loading} style={{ padding: '10px', cursor: 'pointer' }}>
          {loading ? "Analyzing..." : "Analyze Match"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>Match Score: {result.score}%</h2>
          <p><strong>Feedback:</strong> {result.feedback}</p>
        </div>
      )}
    </div>
  );
}

export default App;