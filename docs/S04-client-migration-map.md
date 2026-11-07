# S04 single-client migration map

Canonical client: src/lib/supabase.ts (throws if env is missing, so the client is never null).
Removed: src/services/supabase.ts

| File | Old import | New import |
|---|---|---|
| src/components/AuthProvider.tsx | ../services/supabase | ../lib/supabase |
| src/lib/supabase.ts | ../services/supabase | ./supabase |
| src/Pages/Auth.tsx | ../services/supabase | ../lib/supabase |
| src/Pages/Login.tsx | ../services/supabase | ../lib/supabase |
| src/services/historyService.ts | ./supabase | ../lib/supabase |
| src/services/visionAI.ts | ./supabase | ../lib/supabase |
