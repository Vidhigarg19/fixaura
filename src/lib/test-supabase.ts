
import { env } from '../config/env';

const supabaseUrl = env.supabaseUrl;
const publishableKey = env.supabasePublishableKey;

export async function testSupabaseConnection() {
  console.log('Supabase test function started');

  if (!supabaseUrl || !publishableKey) {
    console.error(
      'Supabase URL or publishable key is missing. Check .env.local'
    );
    return false;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: {
        apikey: publishableKey,
      },
    });

    if (!response.ok) {
      console.error(
        `Supabase health check failed: HTTP ${response.status}`
      );
      return false;
    }

    console.log('Supabase server connection successful!');
    return true;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return false;
  }
}
