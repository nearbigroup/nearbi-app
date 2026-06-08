const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client({
    user: 'postgres',
    host: 'db.hvhigpyopdtyiysnguid.supabase.co',
    database: 'postgres',
    password: '%#P#-+..4e*&x7*',
    port: 5432,
  });
  
  try {
    await client.connect();
    console.log("Connected successfully to PostgreSQL database.");
    
    const sql = fs.readFileSync(path.join(__dirname, 'migrations.sql'), 'utf8');
    console.log("Running migrations...");
    await client.query(sql);
    console.log("Migrations executed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

run();
