import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, MapPin, Clock } from 'lucide-react';

export default function Footer() {
  const clinicAddress = import.meta.env.VITE_CLINIC_ADDRESS || "Av. Providencia 1234, Box 5";
  const dentistPhone = import.meta.env.VITE_DENTIST_PHONE || "+56912345678";

  // Limpiar el teléfono para construir el link wa.me
  const cleanPhone = dentistPhone.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}`;

  // Sistema: sobre el azul marino todo sale de la rampa del primary.
  // Nada de slate-* / gray-* (grises cálidos que sobre marino se ven sucios).
  const colHead = "font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary-300";
  const link = "text-primary-200 hover:text-white transition-colors";
  // Links en línea: subrayado permanente — sobre el marino el color solo no
  // basta como afordancia (y en touch no hay hover).
  const linkInline = "text-primary-200 underline decoration-primary-400 hover:decoration-white hover:text-white underline-offset-4 transition-colors";

  return (
    <footer className="bg-primary text-primary-200 font-sans mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Columna 1: Branding y Redes */}
          <div className="space-y-4">
            <div>
              <span className="font-heading text-2xl font-semibold text-white tracking-tight block">
                Mattodonto
              </span>
              <p className="text-sm text-primary-200 mt-1">
                Agenda tu hora dental de forma simple.
              </p>
            </div>

            {/* Instagram de Collao */}
            <div className="pt-2">
              <a
                href="https://instagram.com/dr.matiascollao"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-primary-200 hover:text-white transition-colors group"
              >
                <div className="p-2 bg-primary-800 rounded-xl group-hover:bg-primary-700 transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                </div>
                <div className="text-left">
                  <span className="text-sm font-semibold block leading-tight text-white">Dr. Matías Collao</span>
                  <span className="text-xs text-primary-300 group-hover:text-primary-200">@dr.matiascollao</span>
                </div>
              </a>
            </div>
          </div>

          {/* Columna 2: Contacto */}
          <div className="space-y-4">
            <h4 className={colHead}>Contacto</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-silver shrink-0 mt-0.5" />
                <span>{clinicAddress}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-silver shrink-0" />
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${linkInline} font-medium tabular-nums`}
                >
                  {dentistPhone} (WhatsApp)
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-silver shrink-0 mt-0.5" />
                <p>
                  Horario según disponibilidad de cada profesional —{" "}
                  <Link to="/" className={linkInline}>agenda online</Link>
                </p>
              </li>
            </ul>
          </div>

          {/* Columna 3: Links rápidos */}
          <div className="space-y-4">
            <h4 className={colHead}>Links Rápidos</h4>
            <div className="flex flex-col gap-2 text-sm items-start">
              <Link to="/" className={link}>Agendar Hora</Link>
              <Link to="/cancel" className={link}>Cancelar Cita</Link>
            </div>
          </div>

        </div>

        {/* Línea inferior (Copyright & Créditos) */}
        <div className="border-t border-primary-800 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-primary-300">
          <p>© 2026 Mattodonto. Todos los derechos reservados.</p>
          <p>
            Diseño y desarrollo web:{" "}
            <a
              href="https://inetmatica.com"
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkInline} font-medium`}
            >
              inetmatica.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
