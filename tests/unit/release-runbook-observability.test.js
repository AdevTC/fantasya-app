import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runbook = readFileSync(
  new URL('../../docs/releases/firebase-production-runbook.md', import.meta.url),
  'utf8',
);

const FIRST_SECTION_HEADING = '## Puertas obligatorias antes de empezar';
const PHASE_6_HEADING = '## Fase 6: rollback, especialmente después de reglas';
const PHASE_7_HEADING = '## Fase 7: retirada posterior de las Functions legacy';
const PHASE_8_HEADING = '## Fase 8: Football Data sigue diferido';

function exactHeadingIndex(document, heading) {
  const matches = [...document.matchAll(/^## .+$/gm)].filter(
    (match) => match[0] === heading,
  );
  assert.equal(matches.length, 1, `expected exactly one heading: ${heading}`);
  return matches[0].index;
}

function extractReleasePhases(document) {
  const firstSectionStart = exactHeadingIndex(document, FIRST_SECTION_HEADING);
  const phase6Start = exactHeadingIndex(document, PHASE_6_HEADING);
  const phase7Start = exactHeadingIndex(document, PHASE_7_HEADING);
  const phase8Start = exactHeadingIndex(document, PHASE_8_HEADING);
  const firstHeading = document.match(/^## .+$/m);

  assert.notEqual(firstHeading, null, 'runbook must contain a level-two heading');
  assert.equal(firstHeading[0], FIRST_SECTION_HEADING);
  assert.equal(firstHeading.index, firstSectionStart);
  assert.ok(firstSectionStart < phase6Start, 'introduction must precede Fase 6');
  assert.ok(phase6Start < phase7Start, 'Fase 6 must precede Fase 7');
  assert.ok(phase7Start < phase8Start, 'Fase 7 must precede Fase 8');

  return {
    introduction: document.slice(0, firstSectionStart),
    phase6: document.slice(phase6Start, phase7Start),
    phase7: document.slice(phase7Start, phase8Start),
  };
}

const { introduction, phase6, phase7 } = extractReleasePhases(runbook);
const normalizedPhase6 = phase6.replace(/\s+/g, ' ').trim();
const normalizedPhase7 = phase7.replace(/\s+/g, ' ').trim();

test('starts the legacy zero-call gate only after the exact frontend SHA is active', () => {
  assert.match(
    introduction,
    /frontend\s+legacy[\s\S]*puede seguir invocando[\s\S]*Functions legacy/i,
  );
  assert.match(
    phase7,
    /Definir `T0` sólo después[\s\S]*frontend nuevo está activo[\s\S]*SHA exacto/i,
  );
  assert.match(
    phase7,
    /llamadas anteriores a `T0`[\s\S]*no cuentan semánticamente[\s\S]*elegir `T0`/i,
  );
  assert.match(
    phase7,
    /iniciada antes de `T0`[\s\S]*punto posterior a `START_UTC`[\s\S]*nuevo\s+`T0`/i,
  );
  assert.match(phase7, /falso positivo conservador/i);
  assert.doesNotMatch(
    phase7,
    /llamadas anteriores a `T0`[\s\S]{0,120}no invalidan/i,
  );
});

test('prohibits the unsafe Firestore rollback from being reused', () => {
  assert.equal(
    normalizedPhase6.includes(
      'El commit `f42effd` no es un rollback seguro y nunca debe volver a desplegarse.',
    ),
    true,
  );
  assert.equal(
    normalizedPhase6.includes(
      'No existe ningún ruleset legacy amplio preaprobado para rollback.',
    ),
    true,
  );
  assert.doesNotMatch(
    phase6,
    /últimos archivos de reglas legacy conocidos como buenos/i,
  );
});

test('pins a reproducible Gen2 request-count observation before legacy deletion', () => {
  assert.match(phase7, /`run\.googleapis\.com\/request_count`/);
  assert.match(phase7, /`cloud_run_revision`/);
  assert.match(phase7, /resource\.labels\.service_name/);
  assert.match(phase7, /resource\.labels\.location/);
  assert.match(phase7, /`serviceConfig\.service`/);
  assert.match(phase7, /gcloud functions describe[\s\S]*--v2/);
  assert.match(phase7, /\(`startTime`, `endTime`\]/);
  assert.match(phase7, /120 segundos/i);
  assert.match(phase7, /respuesta JSON[\s\S]*captura/i);
  assert.match(phase7, /al menos 30 días continuos/i);
  assert.match(phase7, /cero (?:llamadas|solicitudes)[\s\S]*no (?:basta|es suficiente)/i);
  assert.equal(
    normalizedPhase7.includes(
      'Durante la misma ventana se debe conservar la evidencia agregada predeclarada de uso autenticado de la versión actual.',
    ),
    true,
  );
  assert.match(phase7, /catálogo de jugadores[\s\S]*sólo lectura/i);
  assert.match(phase7, /si no hay uso significativo[\s\S]*no borrar/i);

  for (const functionName of [
    'syncLaLigaPlayers',
    'getLaLigaSyncStatus',
    'clearLaLigaPlayers',
  ]) {
    assert.equal(phase7.includes(`\`${functionName}\``), true);
  }
});

test('requires predeclared aggregate exact-SHA usage evidence before deletion', () => {
  assert.equal(
    normalizedPhase7.includes(
      'Actualmente no existe una fuente validada que cumpla este contrato.',
    ),
    true,
  );
  assert.equal(normalizedPhase7.includes('`T0` no puede comenzar.'), true);
  assert.equal(
    normalizedPhase7.includes('`END_UTC = T0 + 30 días`'),
    true,
  );
  assert.doesNotMatch(phase7, /24 horas/i);
  assert.equal(
    normalizedPhase7.includes(
      'Esta guía no implementa ni autoriza telemetría, despliegues o borrados.',
    ),
    true,
  );
  assert.match(phase7, /uso autenticado/i);
  assert.match(phase7, /SHA exacto[\s\S]*(?:sesiones|eventos) autenticad/i);
  assert.match(phase7, /`MIN_AUTHENTICATED_SESSIONS`\s*=\s*(?:[2-9]|\d{2,})/);
  assert.match(phase7, /al menos 2 sesiones[\s\S]*no operad/i);
  assert.match(
    phase7,
    /antes de (?:definir|iniciar) `T0`[\s\S]*fuente agregada[\s\S]*umbral/i,
  );
  assert.match(
    phase7,
    /(?:fuente|umbral)[\s\S]*no (?:pueden|se pueden|puede)[\s\S]*retroactiv/i,
  );
  assert.match(
    phase7,
    /operador[\s\S]*release[\s\S]*auditoría[\s\S]*smoke[\s\S]*no cuentan/i,
  );
  assert.match(phase7, /actividad ambigua[\s\S]*no atribuida[\s\S]*no cuenta/i);
  assert.match(phase7, /misma ventana[\s\S]*30 días/i);
  assert.match(
    phase7,
    /si no existe[\s\S]*fuente[\s\S]*`T0` no puede (?:empezar|comenzar)/i,
  );
  assert.match(
    phase7,
    /telemetría[\s\S]*privacidad[\s\S]*tarea no destructiva separada/i,
  );
  assert.match(phase7, /conteo agregado[\s\S]*sesiones autenticadas[\s\S]*SHA exacto/i);
  assert.match(
    phase7,
    /catálogo de jugadores[\s\S]*(?:evento|conteo) agregado[\s\S]*sólo lectura/i,
  );
  assert.match(
    phase7,
    /sin identificadores de usuario[\s\S]*IPs[\s\S]*tokens[\s\S]*datos personales/i,
  );
  assert.match(
    phase7,
    /evidencia (?:faltante|parcial)[\s\S]*ambigua[\s\S]*por debajo del umbral[\s\S]*SHA no exacto[\s\S]*bloquea[\s\S]*nueva ventana completa/i,
  );
  assert.match(phase7, /aprobación destructiva separada/i);
  assert.match(phase7, /Esta guía no autoriza ejecutar el borrado/i);
});

test('extends the metric query beyond the minimum 30-day window', () => {
  assert.match(phase7, /`QUERY_END_UTC`/);
  assert.match(phase7, /`MAX_TIMEOUT_SECONDS`/);
  assert.match(
    phase7,
    /`QUERY_END_UTC = END_UTC \+ MAX_TIMEOUT_SECONDS \+ 60 \+ 120 segundos`/,
  );
  assert.match(
    phase7,
    /`interval\.endTime`:[\s\S]*`QUERY_END_UTC`/,
  );
  assert.match(phase7, /esperar[\s\S]*`QUERY_END_UTC`/i);
  assert.match(phase7, /rango ampliado[\s\S]*falso positivo/i);
  assert.doesNotMatch(
    phase7,
    /`interval\.endTime`: el `END_UTC` registrado/,
  );
});
