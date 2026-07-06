# Mattodonto - Sistema de Gestión Odontológica

Este proyecto es un sistema de gestión para clínicas odontológicas que permite agendar y cancelar citas con duración predefinida, gestionar la disponibilidad del personal médico y administrar usuarios.

## Tecnologías
* **Frontend**: React (Vite), Tailwind CSS
* **Backend**: Node.js, Express
* **Base de Datos**: Supabase (PostgreSQL)
* **Correos**: Resend

---

## Configuración y Restricciones de Correos (Resend)

El sistema utiliza **Resend** para el envío de correos de confirmación y cancelación.

### Limitaciones en el Plan Gratuito (Modo de Pruebas/Onboarding)
Si estás utilizando una cuenta de Resend sin un dominio propio verificado, aplican las siguientes restricciones estrictas de Resend:
1. **Remitente Obligatorio**: El campo `from` de los correos debe ser estrictamente `onboarding@resend.dev` (el remitente configurado en `backend/services/emailService.js` como `FROM_EMAIL`). No se permite usar correos personalizados como `reservas@mattodonto.com`.
2. **Destinatarios Limitados**: Resend gratuito **solo** permite enviar correos a la dirección de correo electrónico con la cual te registraste en Resend (el dueño de la cuenta). Cualquier intento de enviar un correo a un paciente con un correo distinto fallará con un error del API de Resend.

### Cómo configurar un Dominio de Producción en Resend
Para poder enviar correos a cualquier destinatario y usar un remitente personalizado (ej: `contacto@tudominio.com`):
1. Inicia sesión en tu consola de Resend.
2. Ve a la sección **Domains** (Dominios) y haz clic en **Add Domain**.
3. Ingresa tu dominio propio (ej. `mattodonto.com`).
4. Resend te proporcionará registros DNS de tipo **TXT** y **MX** (para DKIM y SPF).
5. Ve al panel de control del proveedor de tu dominio (ej. GoDaddy, Namecheap, Cloudflare) y agrega estos registros DNS.
6. Una vez agregados, haz clic en **Verify** en la consola de Resend.
7. Una vez que el estado del dominio sea **Verified**, puedes cambiar `FROM_EMAIL` en `backend/services/emailService.js` a cualquier dirección bajo tu dominio (ej. `reservas@mattodonto.com`) y comenzar a enviar correos a cualquier paciente en producción.
