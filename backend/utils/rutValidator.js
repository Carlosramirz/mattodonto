/**
 * Valida un RUT chileno utilizando el algoritmo del Módulo 11.
 * Soporta formatos con o sin puntos y con o sin guión.
 * 
 * @param {string} rutStr RUT a validar.
 * @returns {boolean} true si el RUT es válido, false en caso contrario.
 */
export function validateRut(rutStr) {
  if (typeof rutStr !== 'string') return false;

  // Limpiar puntos, guiones y espacios, dejando solo números y la letra K
  const cleanRut = rutStr.replace(/[^0-9kK]/g, '').toUpperCase();

  // El RUT más corto posible es de 7 dígitos (ej: 1.000.000-1 -> 10000001)
  if (cleanRut.length < 7) return false;

  const dv = cleanRut.slice(-1);
  const body = cleanRut.slice(0, -1);

  if (!/^\d+$/.test(body)) return false;

  // Algoritmo Módulo 11
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const result = 11 - remainder;

  let expectedDv;
  if (result === 11) expectedDv = '0';
  else if (result === 10) expectedDv = 'K';
  else expectedDv = String(result);

  return dv === expectedDv;
}

/**
 * Normaliza un RUT chileno eliminando puntos y agregando guión.
 * Retorna el formato XXXXXXXX-X con el dígito verificador en mayúscula.
 * 
 * @param {string} rutStr RUT a normalizar.
 * @returns {string} RUT normalizado.
 */
export function normalizeRut(rutStr) {
  if (typeof rutStr !== 'string') return '';
  
  const clean = rutStr.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return '';

  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);

  return `${body}-${dv}`;
}
