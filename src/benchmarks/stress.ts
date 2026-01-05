import { createReadStream, readFileSync } from 'fs';
import { join } from 'path';
import { build } from '../runtime/index';

async function runStressTest() {
  const filePath = join(process.cwd(), 'data', 'large-file.json');
  const buffer = readFileSync(filePath);

  if (!buffer) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log('--- JQL Large File Stress Test ---');
  console.log(`File Size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);

  // 1. Single Field Extraction (Skip-Heavy)
  console.log('\n[1] Extracting single field (type) from root...');
  console.time('Skip-Heavy (Streaming)');
  const jqlStreaming = build(buffer, { mode: 'streaming' });
  const result1 = await jqlStreaming.read('{ type }');
  console.timeEnd('Skip-Heavy (Streaming)');
  console.log('Sample Result:', result1);

  // 2. Deep Field Extraction
  console.log('\n[2] Extracting nested fields (actor.login, repo.name)...');
  console.time('Deep Extraction');
  const result2 = await jqlStreaming.read('{ actor { login }, repo { name } }');
  console.timeEnd('Deep Extraction');
  console.log('Sample Result:', result2);

  // 3. Repeated Query with Indexing
  console.log('\n[3] Repeated Query (Indexed Mode)...');
  const jqlIndexed = build(buffer, { mode: 'indexed' });

  console.log('First pass (indexing)...');
  console.time('Indexed Pass 1');
  await jqlIndexed.read('{ type }');
  console.timeEnd('Indexed Pass 1');

  console.log('Second pass (jumping)...');
  console.time('Indexed Pass 2');
  const result3 = await jqlIndexed.read('{ type }');
  console.timeEnd('Indexed Pass 2');
  console.log('Result 3:', result3);

  // 4. ReadableStream Performance
  console.log('\n[4] ReadableStream Performance...');
  const stream = new ReadableStream({
    start(controller) {
      const fsStream = createReadStream(filePath);
      fsStream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      fsStream.on('end', () => controller.close());
    }
  });

  console.time('ReadableStream Pass');
  const jqlStream = build(stream);
  const result4 = await jqlStream.read('{ id, created_at, public }');
  console.timeEnd('ReadableStream Pass');
  console.log('Sample Row (Stream):', (result4 as any)[0]);
}

runStressTest().catch(console.error);
