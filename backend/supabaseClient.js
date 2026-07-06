import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// For monorepo, maybe the .env is in the root or in the backend folder.
// Let's assume there is a .env in the backend folder.
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
