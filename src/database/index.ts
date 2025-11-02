import initSqlJs, { Database } from 'sql.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

let db: Database | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

export async function getDatabase(): Promise<Database> {
  if (!db || !SQL) {
    if (!SQL) {
      // Try to load from node_modules first
      const wasmPath = path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
      
      SQL = await initSqlJs({
        locateFile: (file: string) => {
          if (file.endsWith('.wasm')) {
            // Try local wasm file first
            if (fs.existsSync(wasmPath)) {
              return wasmPath;
            }
            // Fallback to CDN
            return `https://sql.js.org/dist/${file}`;
          }
          return file;
        },
      });
    }

    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (fs.existsSync(config.database.path)) {
      try {
        const buffer = fs.readFileSync(config.database.path);
        db = new SQL.Database(buffer);
        logger.info('Database loaded from file', { path: config.database.path });
      } catch (error) {
        logger.warn('Error loading database, creating new one', { error });
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
      logger.info('New database created in memory');
    }
  }
  
  if (!db) {
    throw new Error('Failed to initialize database');
  }
  
  return db;
}

export async function saveDatabase(): Promise<void> {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(config.database.path, buffer);
      logger.debug('Database saved', { path: config.database.path });
    } catch (error) {
      logger.error('Error saving database', { error });
    }
  }
}

export async function initializeDatabase(): Promise<void> {
  const database = await getDatabase();

  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT NOT NULL UNIQUE,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS specifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        spec_json TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_specs_user_type ON specifications(user_id, type);
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_specs_active_type ON specifications(active, type);
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spec_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        record_json TEXT NOT NULL,
        processed_at DATETIME,
        FOREIGN KEY (spec_id) REFERENCES specifications(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_records_spec_created ON records(spec_id, created_at);
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_records_user_created ON records(user_id, created_at);
    `);

    database.run(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spec_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        reminder_type TEXT NOT NULL,
        next_execution DATETIME NOT NULL,
        reminder_config TEXT NOT NULL,
        message_template TEXT,
        action_config TEXT,
        record_id INTEGER,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (spec_id) REFERENCES specifications(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (record_id) REFERENCES records(id)
      );
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_reminders_spec_next ON reminders(spec_id, next_execution);
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_reminders_user_next ON reminders(user_id, next_execution);
    `);

    database.run(`
      CREATE INDEX IF NOT EXISTS idx_reminders_active_next ON reminders(active, next_execution);
    `);

    await saveDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Error initializing database', { error });
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await saveDatabase();
    db.close();
    db = null;
    SQL = null;
    logger.info('Database closed');
  }
}

// Helper function to run SQL queries with parameter binding
export async function runQuery(sql: string, params: any[] = []): Promise<void> {
  const database = await getDatabase();
  
  try {
    const stmt = database.prepare(sql);
    
    if (params.length > 0) {
      const sanitizedParams = params.map(p => {
        if (p === undefined) return null;
        if (typeof p === 'string' || typeof p === 'number' || typeof p === 'boolean' || p === null) {
          return p;
        }
        return String(p);
      });
      stmt.bind(sanitizedParams);
    }
    
    stmt.step();
    stmt.free();
    
    await saveDatabase();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isUniqueConstraint = errorMessage.includes('UNIQUE constraint');
    
    if (!isUniqueConstraint) {
      logger.error('Error in runQuery', { 
        error: errorMessage, 
        sql, 
        params,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
    throw error;
  }
}

// Helper function to get results with parameter binding
export async function getQuery(sql: string, params: any[] = []): Promise<any[]> {
  const database = await getDatabase();
  
  try {
    const stmt = database.prepare(sql);
    
    if (params.length > 0) {
      const sanitizedParams = params.map(p => {
        if (p === undefined) return null;
        if (typeof p === 'string' || typeof p === 'number' || typeof p === 'boolean' || p === null) {
          return p;
        }
        return String(p);
      });
      stmt.bind(sanitizedParams);
    }
    
    const results: any[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({ ...row });
    }
    
    stmt.free();
    
    logger.debug('getQuery result', { sql, params, resultCount: results.length, results });
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error in getQuery', { 
      error: errorMessage, 
      sql, 
      params,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Helper function to get a single row
export async function getOne(sql: string, params: any[] = []): Promise<any | null> {
  const results = await getQuery(sql, params);
  if (results.length === 0) {
    return null;
  }
  const result = results[0];
  logger.debug('getOne result', { sql, params, result, keys: Object.keys(result) });
  return result;
}
