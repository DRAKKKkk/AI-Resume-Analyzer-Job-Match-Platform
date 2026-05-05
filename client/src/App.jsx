import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Toggle these depending on if you are testing locally or deploying
// const BACKEND_URL = 'http://localhost:5000'; // <-- Use this for local testing
// const BACKEND_URL = 'https://resume-ai-backend-lki4.onrender.com'; // <-- Use this for Vercel deployment

const socket = io(BACKEND_URL);

function App() {
  const [file, setFile] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [socketRoom, setSocketRoom] = useState('');
  const [history, setHistory] = useState([]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const room = Math.random().toString(36).substring(7);
    setSocketRoom(room);
    socket.emit('join', room);

    fetchHistory();

    socket.on('analysisComplete', (data) => {
      setResult(data);
      setLoading(false);
      fetchHistory();
    });

    return () => {
      socket.off('analysisComplete');
    };
  }, []);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!file || !jobDescription) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('jobTitle', jobTitle);
    formData.append('companyName', companyName);
    formData.append('jobDescription', jobDescription);
    formData.append('socketRoom', socketRoom);
    formData.append('resume', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }
    } catch (error) {
      setLoading(false);
    }
  };

  const groupedHistory = history?.reduce((acc, curr) => {
    const company = curr.company_name || 'Unknown';
    if (!acc[company]) acc[company] = [];
    acc[company].push(curr);
    return acc;
  }, {}) || {};

  const renderFeedback = (feedbackData) => {
    let parsed = feedbackData;

    while (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {
        break;
      }
    }

    // Fixed logic: Handles both simple strings array ["AWS", "React"] and complex objects
    if (Array.isArray(parsed)) {
      return (
        <ul style={{ margin: '4px 0 0 20px', padding: 0, color: '#555', fontSize: '14px' }}>
          {parsed.map((item, i) => {
            if (typeof item === 'string') {
              return <li key={i} style={{ marginBottom: '4px', lineHeight: '1.4', listStyleType: 'disc' }}>{item}</li>;
            }
            return (
              <div key={i} style={{ marginBottom: '12px', marginLeft: '-20px', listStyleType: 'none' }}>
                <strong style={{ display: 'block', color: '#2c3e50', fontSize: '14px', textTransform: 'uppercase' }}>{item.section || 'Feedback'}</strong>
                <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                  {item.points?.map((pt, j) => <li key={j} style={{ marginBottom: '4px', lineHeight: '1.4', listStyleType: 'disc' }}>{pt}</li>)}
                </ul>
              </div>
            );
          })}
        </ul>
      );
    }

    return <p style={{ fontSize: '14px', color: '#555', lineHeight: '1.6' }}>{String(feedbackData)}</p>;
  };
  
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>AI Resume Matcher</h1>

      <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: '#f8f9fa', padding: '25px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        
        <div style={{ display: 'flex', gap: '15px' }}>
          <input 
            type="text" 
            placeholder="Company Name"
            value={companyName} 
            onChange={(e) => setCompanyName(e.target.value)} 
            required 
            style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
          <input 
            type="text" 
            placeholder="Job Title"
            value={jobTitle} 
            onChange={(e) => setJobTitle(e.target.value)} 
            required 
            style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <textarea 
            placeholder="Job Description"
            rows="6" 
            value={jobDescription} 
            onChange={(e) => setJobDescription(e.target.value)} 
            required 
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <div>
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
            padding: '12px 30px', 
            backgroundColor: loading ? '#95a5a6' : '#3498db', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px', 
            fontSize: '16px', 
            fontWeight: 'bold', 
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: '10px',
            alignSelf: 'center',
            minWidth: '200px'
          }}>
          {loading ? "Analyzing..." : "Analyze Match"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: '30px', padding: '25px', backgroundColor: '#e8f6f3', borderRadius: '10px', borderLeft: '5px solid #1abc9c' }}>
          <h2 style={{ margin: '0 0 10px 0', color: '#16a085' }}>Match Score: {result.score}%</h2>
         <div style={{ marginTop: '10px' }}>
            {renderFeedback(result.feedback)}
          </div>
        </div>
      )}

      {Object.keys(groupedHistory).length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <h3 style={{ color: '#2c3e50', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>History by Company</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '15px' }}>
            {Object.entries(groupedHistory).map(([company, roles]) => (
              <div key={company} style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <div style={{ backgroundColor: '#34495e', color: 'white', padding: '10px 20px', fontWeight: 'bold', fontSize: '18px' }}>
                  {company}
                </div>
                <div style={{ padding: '15px' }}>
                  {roles.map((item, index) => (
                    <div key={index} style={{ marginBottom: index !== roles.length - 1 ? '15px' : '0', paddingBottom: index !== roles.length - 1 ? '15px' : '0', borderBottom: index !== roles.length - 1 ? '1px solid #eee' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '16px', color: '#2c3e50' }}>{item.job_title}</strong>
                        <span style={{ 
                          backgroundColor: item.match_score >= 70 ? '#2ecc71' : (item.match_score >= 40 ? '#f1c40f' : '#e74c3c'), 
                          color: item.match_score >= 40 && item.match_score < 70 ? '#000' : '#fff', 
                          padding: '4px 10px', 
                          borderRadius: '20px', 
                          fontSize: '13px', 
                          fontWeight: 'bold' 
                        }}>
                          {item.match_score}%
                        </span>
                      </div>
                     <div style={{ marginTop: '8px' }}>
                        {renderFeedback(item.feedback)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;