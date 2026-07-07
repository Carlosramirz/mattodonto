-- ============================================================================
-- ADVERTENCIA DE SEGURIDAD
-- Agregar el rol 'assistant' al enum user_role
-- ============================================================================

-- Agregar el valor 'assistant' al enum user_role
alter type public.user_role add value if not exists 'assistant';

-- Comentario explicativo
comment on type public.user_role is 'Roles de usuario: admin, dentist, assistant.';
