import fs from 'fs';

const code = fs.readFileSync('./src/services/googleDriveSync.js', 'utf8');
const lines = code.split('\n');

console.log('=== GOOGLE DRIVE SYNC BUNDLE EXTRACTION & HYDRATION MAP ===');
lines.forEach((l, i) => {
  if (l.includes('extractLocalBundles') || l.includes('hydrateLocalBundles') || l.includes('mergeBundlesInMemory') || l.includes('SYNC_BUNDLES') || l.includes('curriculum') || l.includes('study_logs')) {
    if (l.length < 120) {
      console.log(`Line ${i + 1}: ${l.trim()}`);
    }
  }
});
