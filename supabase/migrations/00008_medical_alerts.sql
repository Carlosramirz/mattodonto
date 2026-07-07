-- ============================================================================
-- ADVERTENCIA DE SEGURIDAD Y PRIVACIDAD
-- La columna medical_alerts en public.patients contiene información médica
-- y de salud altamente sensible (alergias, condiciones crónicas, etc.).
-- ============================================================================

-- Agregar columna medical_alerts a la tabla patients
alter table public.patients
add column if not exists medical_alerts jsonb default '[]'::jsonb not null;

-- Agregar comentario descriptivo a la columna
comment on column public.patients.medical_alerts is 'Lista persistente de alertas médicas, alergias o condiciones de riesgo del paciente (datos de salud sensibles).';
