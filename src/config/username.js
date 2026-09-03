export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function getUsernameValidationError(value) {
  const username = normalizeUsername(value);

  if (username.length < 3 || username.length > 16) {
    return 'Debe tener entre 3 y 16 caracteres.';
  }
  if (!/^[a-z0-9_.]+$/.test(username)) {
    return "Solo minúsculas, números, '_' y '.' permitidos.";
  }
  if (username.startsWith('.') || username.endsWith('.')) {
    return 'No puede empezar o acabar con un punto.';
  }
  if (/^\d/.test(username)) {
    return 'No puede empezar con un número.';
  }

  return null;
}
