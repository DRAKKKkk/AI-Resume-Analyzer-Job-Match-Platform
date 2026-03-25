import pool from './db.js';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
    await pool.query("DELETE FROM analyses;");
    
    const redisOpts = { 
        maxRetriesPerRequest: null,
        tls: { rejectUnauthorized: false } 
    };
    const redis = new IORedis(process.env.REDIS_URL, redisOpts);
    
    await redis.flushdb();
    
    process.exit();
}
run();