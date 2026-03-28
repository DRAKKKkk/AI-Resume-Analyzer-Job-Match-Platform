import React, { useState } from 'react';

export default function ResumeAnalyzer() {
    const [file, setFile] = useState(null);
    const [jobDescription, setJobDescription] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleAnalyze = async (e) => {
        e.preventDefault();
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('resume', file);
        formData.append('jobDescription', jobDescription);
        formData.append('jobTitle', jobTitle);
        formData.append('companyName', companyName);

        try {
            const response = await fetch('http://localhost:5000/api/analyze', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            setResult(data);
        } catch (error) {
            setResult({ error: "Failed to connect to server" });
        }
        setLoading(false);
    };

    return (
        <div style={{ maxWidth: '600px', margin: 'auto', padding: '20px' }}>
            <h2>AI Resume Analyzer</h2>
            <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input 
                    type="file" 
                    accept="application/pdf" 
                    onChange={(e) => setFile(e.target.files[0])} 
                    required 
                />
                <input 
                    type="text" 
                    placeholder="Job Title" 
                    value={jobTitle} 
                    onChange={(e) => setJobTitle(e.target.value)} 
                />
                <input 
                    type="text" 
                    placeholder="Company Name" 
                    value={companyName} 
                    onChange={(e) => setCompanyName(e.target.value)} 
                />
                <textarea 
                    placeholder="Job Description" 
                    value={jobDescription} 
                    onChange={(e) => setJobDescription(e.target.value)} 
                    rows="5" 
                    required 
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Analyzing...' : 'Analyze Resume'}
                </button>
            </form>

            {result && (
                <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc' }}>
                    {result.error ? (
                        <p style={{ color: 'red' }}>{result.error}</p>
                    ) : (
                        <>
                            <h3>Compatibility Score: {result.compatibilityScore}%</h3>
                            <h4>Missing Keywords:</h4>
                            <ul>
                                {result.missingKeywords?.length > 0 ? (
                                    result.missingKeywords.map((kw, i) => <li key={i}>{kw}</li>)
                                ) : (
                                    <li>None. Strong match.</li>
                                )}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}