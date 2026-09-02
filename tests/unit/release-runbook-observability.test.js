import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runbook = readFileSync(
  new URL('../../docs/releases/firebase-production-runbook.md', import.meta.url),
  'utf8',
);

test('starts the legacy zero-call gate only after the exact frontend SHA is active', () => {
  assert.match(
    runbook,
    /frontend\s+legacy[\s\S]*puede seguir invocando[\s\S]*Functions legacy/i,
  );
  assert.match(
    runbook,
    /Definir `T0` sólo después[\s\S]*frontend nuevo está activo[\s\S]*SHA exacto/i,
  );
  assert.match(runbook, /llamadas anteriores a `T0`[\s\S]*no invalidan/i);
});

test('pins a reproducible Gen2 request-count observation before legacy deletion', () => {
  assert.match(runbook, /`run\.googleapis\.com\/request_count`/);
  assert.match(runbook, /`cloud_run_revision`/);
  assert.match(runbook, /resource\.labels\.service_name/);
  assert.match(runbook, /resource\.labels\.location/);
  assert.match(runbook, /`serviceConfig\.service`/);
  assert.match(runbook, /gcloud functions describe[\s\S]*--v2/);
  assert.match(runbook, /\(`startTime`, `endTime`\]/);
  assert.match(runbook, /120 segundos/i);
  assert.match(runbook, /respuesta JSON[\s\S]*captura/i);

  for (const functionName of [
    'syncLaLigaPlayers',
    'getLaLigaSyncStatus',
    'clearLaLigaPlayers',
  ]) {
    assert.equal(runbook.includes(`\`${functionName}\``), true);
  }
});

test('extends the metric query beyond the minimum 24-hour window', () => {
  assert.match(runbook, /`QUERY_END_UTC`/);
  assert.match(runbook, /`MAX_TIMEOUT_SECONDS`/);
  assert.match(
    runbook,
    /`QUERY_END_UTC = END_UTC \+ MAX_TIMEOUT_SECONDS \+ 60 \+ 120 segundos`/,
  );
  assert.match(
    runbook,
    /`interval\.endTime`:[\s\S]*`QUERY_END_UTC`/,
  );
  assert.match(runbook, /esperar[\s\S]*`QUERY_END_UTC`/i);
  assert.match(runbook, /rango ampliado[\s\S]*falso positivo/i);
  assert.doesNotMatch(
    runbook,
    /`interval\.endTime`: el `END_UTC` registrado/,
  );
});
