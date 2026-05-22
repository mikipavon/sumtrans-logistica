import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n');
const keys = {};
lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
        keys[key.trim()] = value.trim();
    }
});

const supabaseUrl = keys['VITE_SUPABASE_URL'];
const supabaseAnonKey = keys['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing keys in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
  const tables = ['clients', 'drivers', 'shipments'];
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`Error checking ${table}:`, error.message);
    } else {
      console.log(`Table ${table} has ${count} records.`);
    }
  }
}

checkData();
