CREATE DATABASE resumematcher;

CREATE TABLE analyses (
    id SERIAL PRIMARY KEY,
    job_title VARCHAR(255),
    match_score INTEGER,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);