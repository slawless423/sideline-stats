#!/usr/bin/env node
// Writes all data from JSON files to database
import fs from 'fs';
import { initDb, upsertTeam, insertGame, upsertPlayer, closeDb } from './db_writer.mjs';

async function main() {
  console.log('📊 Starting database sync...\n');
  
  // Initialize database
  initDb();
  
  // Read JSON files
  console.log('Reading JSON files...');
  const teamStatsData = JSON.parse(fs.readFileSync('team_stats.json', 'utf8'));
  
  console.log(`Found ${teamStatsData.length} teams`);
  
  // Read game cache which has all parsed games
  let gamesData = [];
  try {
    const gameCache = JSON.parse(fs.readFileSync('game_cache.json', 'utf8'));
    gamesData = Object.values(gameCache).filter(g => g.success && g.data);
    console.log(`Found ${gamesData.length} games from cache`);
  } catch (err) {
    console.log('No game cache found, will only sync teams');
  }
  
  // Write teams
  console.log('\nWriting teams...');
  for (const team of teamStatsData) {
    await upsertTeam(team);
  }
  console.log('✅ Teams written\n');
  
  // Write games from cache
  if (gamesData.length > 0) {
    console.log('Writing games...');
    let gamesWritten = 0;
    for (const cached of gamesData) {
      try {
        await insertGame(cached.data);
        gamesWritten++;
        if (gamesWritten % 500 === 0) {
          console.log(`  ${gamesWritten} games written...`);
        }
      } catch (err) {
        // Game already exists or error
      }
    }
    console.log(`✅ ${gamesWritten} games written\n`);
  }
  
  await closeDb();
  console.log('🎉 Database sync complete!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
