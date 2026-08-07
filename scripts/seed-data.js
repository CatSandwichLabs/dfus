const { getDatabase } = require('../src/repositories/database');
const bcrypt = require('bcrypt');

async function seed() {
  const db = getDatabase();
  
  try {
    const adminEmail = 'admin@dfus.cloud';
    const existingAdmin = await db.findUserByEmail(adminEmail);
    
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await db.createUser({
        email: adminEmail,
        passwordHash,
        role: 'admin',
        storageQuota: 100 * 1024 * 1024 * 1024 // 100GB for admin
      });
      console.log('Admin user created successfully.');
    } else {
      console.log('Admin user already exists.');
    }
  } catch (err) {
    console.error('Seeding failed:', err);
  }
}

// In a real app we might connect explicitly here, but database.js might handle it.
seed().then(() => {
  console.log('Seeding complete.');
  process.exit(0);
});
