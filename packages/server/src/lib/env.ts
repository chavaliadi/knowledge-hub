import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

let envLoaded = false;

/**
 * Robustly resolves and loads the project's .env file by searching upward
 * from the current working directory, module location, and repository root.
 */
export function loadEnv(): void {
  if (envLoaded) return;

  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    __dirname,
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
  ];

  for (const dir of candidateDirs) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      envLoaded = true;
      return;
    }
  }

  // Fallback to default dotenv discovery
  dotenv.config();
  envLoaded = true;
}

// Auto-run on import to ensure env vars are populated immediately
loadEnv();
