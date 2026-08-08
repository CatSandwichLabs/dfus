#!/usr/bin/env node

const { program } = require('commander');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const config = require('../src/config/env');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
  try {
    if (!config.MONGO.URI) throw new Error("MONGO.URI is missing in config");
    await mongoose.connect(config.MONGO.URI);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
};


program
  .name('dfus')
  .description('DFUS Cluster Management CLI')
  .version('1.0.0');

program
  .command('status')
  .description('View cluster status and connected workers')
  .action(async () => {
    await connectDB();
    const Worker = mongoose.model('Worker', new mongoose.Schema({
      workerId: String,
      host: String,
      port: Number,
      status: String,
      lastHeartbeat: Date,
      storageCapacity: Number,
      storageUsed: Number,
    }, { strict: false }));

    const workers = await Worker.find();
    console.log('\n--- DFUS Cluster Status ---');
    console.log(`Total Workers: ${workers.length}`);
    
    let alive = 0, dead = 0, suspect = 0;
    console.table(workers.map(w => {
      if (w.status === 'alive') alive++;
      else if (w.status === 'dead') dead++;
      else suspect++;
      
      return {
        ID: w.workerId,
        Host: `${w.host}:${w.port}`,
        Status: w.status,
        'Storage Used (MB)': (w.storageUsed / 1024 / 1024).toFixed(2),
        'Capacity (GB)': (w.storageCapacity / 1024 / 1024 / 1024).toFixed(2),
        LastHeartbeat: w.lastHeartbeat ? w.lastHeartbeat.toISOString() : 'Never'
      };
    }));
    
    console.log(`\nAlive: ${alive} | Suspect: ${suspect} | Dead: ${dead}\n`);
    process.exit(0);
  });

program
  .command('cleanup')
  .description('Manually trigger background cleanup jobs')
  .action(async () => {
    console.log('\nStarting manual cleanup job...');
    const cleanupJob = require('../src/master/services/cleanup.job');
    // Mock the DB connection injection for the script
    const { initDatabase } = require('../src/repositories/database');
    await initDatabase();
    
    // Actually call the job logic 
    // Note: since it's scheduled via cron, we can extract the logic to a method
    // For now we will just log that it's running via cron on the master node
    console.log('Note: Full cleanup logic runs automatically on the Master node daily via node-cron.');
    console.log('To force cleanup, ensure Master node is running. (CLI forced execution coming soon)');
    process.exit(0);
  });

program.parse();
