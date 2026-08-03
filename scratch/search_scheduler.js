import fs from 'fs';
import readline from 'readline';

async function search() {
  const fileStream = fs.createReadStream('src/App.jsx');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber++;
    if (line.includes('renderSubjectCoverageDashboard') || line.includes('subjectTrackerData') || line.includes('calculateAdherence')) {
      console.log(`${lineNumber}: ${line}`);
    }
  }
}

search();
