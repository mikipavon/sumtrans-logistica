import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseInstance;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials missing. Using infinite proxy to prevent crash.');
  
  const createInfiniteProxy = () => {
    const fn = (...args) => createInfiniteProxy();
    return new Proxy(fn, {
      get: (target, prop) => {
        if (prop === 'then') return (cb) => Promise.resolve({ data: [], error: null }).then(cb);
        if (prop === 'catch') return (cb) => Promise.resolve({ data: [], error: null }).catch(cb);
        return createInfiniteProxy();
      }
    });
  };

  supabaseInstance = createInfiniteProxy();
} else {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey)
  } catch (e) {
    console.error('❌ Critical error creating Supabase client:', e);
    supabaseInstance = new Proxy({}, {
      get: (target, prop) => () => ({ data: null, error: e })
    });
  }
}

export const supabase = supabaseInstance;
