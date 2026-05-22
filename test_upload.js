import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUpload() {
  const blob = new Blob(['hello'], { type: 'text/plain' });
  const { data, error } = await supabase.storage.from('payrolls').upload('test.txt', blob, { upsert: true });
  console.log('Result:', data);
  console.log('Error:', error);
}

testUpload();
