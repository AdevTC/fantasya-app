import fs from 'node:fs/promises';
import {
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

export async function createRulesEnvironment() {
  return initializeTestEnvironment({
    projectId: 'demo-fantasya',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await fs.readFile('firestore.rules', 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: await fs.readFile('storage.rules', 'utf8'),
    },
  });
}
