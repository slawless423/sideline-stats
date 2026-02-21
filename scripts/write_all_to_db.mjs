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
  const ratingsData = JSON.parse(fs.readFileSync('public/data/ratings.json', 'utf8'));
  
  // Debug: check structure
  console.log('Ratings data keys:', Object.keys(ratingsData));
  
  // Handle different possible structures
  let teams = ratingsData.teams || ratingsData.rows || ratingsData;
  if (!Array.isArray(teams)) {
    console.log('❌ Could not find teams array in ratings.json');
    console.log('Data structure:', JSON.stringify(ratingsData).substring(0, 200));
    process.exit(1);
  }
  
  console.log(`Found ${teams.length} teams`);
  
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
  console.log('First team sample:', JSON.stringify(teams[0]).substring(0, 300));
  
  for (const team of teams) {
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
