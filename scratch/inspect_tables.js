const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('Connected to PostgreSQL');

  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('Tables in public schema:');
    res.rows.forEach(r => console.log(`- ${r.table_name}`));

    // Inspect columns of role_permissions if it exists
    const hasRolePermissions = res.rows.some(r => r.table_name === 'role_permissions');
    if (hasRolePermissions) {
      const cols = await client.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'role_permissions';
      `);
      console.log('\nColumns in role_permissions:');
      cols.rows.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
