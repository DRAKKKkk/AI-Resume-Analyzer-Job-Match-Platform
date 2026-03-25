import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool(
  process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'tejas@123',
        host: process.env.DB_HOST || 'db',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'postgres'
      }
);

export default pool;