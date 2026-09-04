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
  assert.match(
    runbook,
    /llamadas anteriores a `T0`[\s\S]*no cuentan semánticamente[\s\S]*elegir `T0`/i,
  );
  assert.match(
    runbook,
    /iniciada antes de `T0`[\s\S]*punto posterior a `START_UTC`[\s\S]*nuevo\s+`T0`/i,
  );
  assert.match(runbook, /falso positivo conservador/i);
  assert.doesNotMatch(
    runbook,
    /llamadas anteriores a `T0`[\s\S]{0,120}no invalidan/i,
  );
});

test('prohibits the unsafe Firestore rollback from being reused', () => {
  assert.match(runbook, /`f42effd`[\s\S]*no (?:es|constituye)[\s\S]*rollback seguro/i);
  assert.match(runbook, /no existe[\s\S]*ruleset legacy[\s\S]*preaprobado/i);
  assert.doesNotMatch(runbook, /últimos archivos de reglas legacy conocidos como buenos/i);
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
  assert.match(runbook, /al menos 30 días continuos/i);
  assert.match(runbook, /cero (?:llamadas|solicitudes)[\s\S]*no (?:basta|es suficiente)/i);
  assert.match(runbook, /uso significativo[\s\S]*versión actual/i);
  assert.match(runbook, /catálogo de jugadores[\s\S]*sólo lectura/i);
  assert.match(runbook, /si no hay uso significativo[\s\S]*no borrar/i);

  for (const functionName of [
    'syncLaLigaPlayers',
    'getLaLigaSyncStatus',
    'clearLaLigaPlayers',
  ]) {
    assert.equal(runbook.includes(`\`${functionName}\``), true);
  }
});

test('requires predeclared aggregate exact-SHA usage evidence before deletion', () => {
  assert.match(runbook, /uso autenticado/i);
  assert.match(runbook, /SHA exacto[\s\S]*(?:sesiones|eventos) autenticad/i);
  assert.match(runbook, /`MIN_AUTHENTICATED_SESSIONS`\s*=\s*(?:[2-9]|\d{2,})/);
  assert.match(runbook, /al menos 2 sesiones[\s\S]*no operad/i);
  assert.match(
    runbook,
    /antes de (?:definir|iniciar) `T0`[\s\S]*fuente agregada[\s\S]*umbral/i,
  );
  assert.match(
    runbook,
    /(?:fuente|umbral)[\s\S]*no (?:pueden|se pueden|puede)[\s\S]*retroactiv/i,
  );
  assert.match(
    runbook,
    /operador[\s\S]*release[\s\S]*auditoría[\s\S]*smoke[\s\S]*no cuentan/i,
  );
  assert.match(runbook, /actividad ambigua[\s\S]*no atribuida[\s\S]*no cuenta/i);
  assert.match(runbook, /misma ventana[\s\S]*30 días/i);
  assert.match(
    runbook,
    /si no existe[\s\S]*fuente[\s\S]*`T0` no puede (?:empezar|comenzar)/i,
  );
  assert.match(
    runbook,
    /telemetría[\s\S]*privacidad[\s\S]*tarea no destructiva separada/i,
  );
  assert.match(runbook, /conteo agregado[\s\S]*sesiones autenticadas[\s\S]*SHA exacto/i);
  assert.match(
    runbook,
    /catálogo de jugadores[\s\S]*(?:evento|conteo) agregado[\s\S]*sólo lectura/i,
  );
  assert.match(
    runbook,
    /sin identificadores de usuario[\s\S]*IPs[\s\S]*tokens[\s\S]*datos personales/i,
  );
  assert.match(
    runbook,
    /evidencia (?:faltante|parcial)[\s\S]*por debajo del umbral[\s\S]*bloquea[\s\S]*nueva ventana completa/i,
  );
  assert.match(runbook, /aprobación destructiva separada/i);
  assert.match(runbook, /Esta guía no autoriza ejecutar el borrado/i);
});

test('extends the metric query beyond the minimum 30-day window', () => {
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
