import { getDatabase, saveDatabase } from '../database';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Migra timestamps UTC antigos para timezone local (America/Sao_Paulo)
 * Converte timestamps que estão em UTC (antes da implementação do timezone) 
 * para o timezone local correto
 */
async function migrateTimezones() {
  try {
    logger.info('Starting timezone migration...');
    const db = await getDatabase();

    // Offset de Brasília: UTC-3
    const offsetHours = -3;

    // Migrar records
    const recordsStmt = db.prepare('SELECT id, created_at FROM records');
    let recordCount = 0;
    
    while (recordsStmt.step()) {
      const row = recordsStmt.getAsObject();
      const id = row.id;
      const createdAt = row.created_at as string;
      
      // Verifica se parece com UTC (formato ISO com Z ou +00:00)
      // Ou se a data parece estar "adiantada" em 3 horas
      const date = new Date(createdAt);
      
      // Ajusta subtraindo o offset (adiciona 3 horas para Brasília = -3 UTC)
      date.setHours(date.getHours() + offsetHours);
      
      const newTimestamp = date.toISOString().replace('T', ' ').substring(0, 19);
      
      const updateStmt = db.prepare('UPDATE records SET created_at = ? WHERE id = ?');
      updateStmt.bind([newTimestamp, id]);
      updateStmt.step();
      updateStmt.free();
      
      recordCount++;
      
      logger.debug('Migrated record', { id, old: createdAt, new: newTimestamp });
    }
    recordsStmt.free();

    // Migrar specifications
    const specsStmt = db.prepare('SELECT id, created_at, updated_at FROM specifications');
    let specCount = 0;
    
    while (specsStmt.step()) {
      const row = specsStmt.getAsObject();
      const id = row.id;
      const createdAt = row.created_at as string;
      const updatedAt = row.updated_at as string;
      
      const createdDate = new Date(createdAt);
      createdDate.setHours(createdDate.getHours() + offsetHours);
      const newCreatedAt = createdDate.toISOString().replace('T', ' ').substring(0, 19);
      
      const updatedDate = new Date(updatedAt);
      updatedDate.setHours(updatedDate.getHours() + offsetHours);
      const newUpdatedAt = updatedDate.toISOString().replace('T', ' ').substring(0, 19);
      
      const updateStmt = db.prepare('UPDATE specifications SET created_at = ?, updated_at = ? WHERE id = ?');
      updateStmt.bind([newCreatedAt, newUpdatedAt, id]);
      updateStmt.step();
      updateStmt.free();
      
      specCount++;
    }
    specsStmt.free();

    // Migrar users
    const usersStmt = db.prepare('SELECT id, created_at FROM users');
    let userCount = 0;
    
    while (usersStmt.step()) {
      const row = usersStmt.getAsObject();
      const id = row.id;
      const createdAt = row.created_at as string;
      
      const date = new Date(createdAt);
      date.setHours(date.getHours() + offsetHours);
      const newTimestamp = date.toISOString().replace('T', ' ').substring(0, 19);
      
      const updateStmt = db.prepare('UPDATE users SET created_at = ? WHERE id = ?');
      updateStmt.bind([newTimestamp, id]);
      updateStmt.step();
      updateStmt.free();
      
      userCount++;
    }
    usersStmt.free();

    await saveDatabase();
    
    logger.info('Timezone migration completed', {
      records: recordCount,
      specifications: specCount,
      users: userCount
    });

    console.log(`\n✅ Migração concluída com sucesso!`);
    console.log(`   - ${recordCount} registros migrados`);
    console.log(`   - ${specCount} especificações migradas`);
    console.log(`   - ${userCount} usuários migrados`);
    console.log(`\nTimestamps convertidos de UTC para ${config.app.timezone}\n`);
  } catch (error) {
    logger.error('Error during timezone migration', { error });
    console.error('❌ Erro na migração:', error);
    throw error;
  }
}

// Execute migration
migrateTimezones()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

