import type { Metadata } from "next";
import LegalDocumentLayout, {
  LegalSectionItem,
} from "@/components/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Condiciones de Servicio",
  description:
    "Condiciones de Servicio, términos de acceso mediante Google OAuth 2.0, suscripción mensual Piloto Plus en MercadoPago y reglas de uso de PILOTO Streaming.",
  alternates: {
    canonical: "/condiciones",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "Condiciones de Servicio | PILOTO Streaming",
    description:
      "Términos y condiciones que rigen el acceso a la plataforma PILOTO Streaming y a la suscripción mensual Piloto Plus.",
    url: "https://cine-ddbt.vercel.app/condiciones",
    siteName: "PILOTO Streaming",
    locale: "es_AR",
    type: "article",
    images: [{ url: "/logo.jpg", alt: "PILOTO Streaming" }],
  },
};

const TERMS_SECTIONS: LegalSectionItem[] = [
  {
    id: "aceptacion",
    title: "1. Aceptación de las Condiciones",
    paragraphs: [
      "Las presentes Condiciones de Servicio regulan el acceso y uso de la plataforma web PILOTO Streaming, disponible en https://cine-ddbt.vercel.app, operada por Facundo Argüello.",
      "Al iniciar sesión o utilizar cualquiera de las funcionalidades del sitio, el usuario declara haber leído, comprendido y aceptado íntegramente estas Condiciones de Servicio junto con la Política de Privacidad disponible en https://cine-ddbt.vercel.app/privacidad.",
    ],
  },
  {
    id: "descripcion-servicio",
    title: "2. Objeto y Alcance del Servicio",
    paragraphs: [
      "PILOTO Streaming es una plataforma web orientada a la exploración de catálogo audiovisual, seguimiento de progreso de reproducción («Continuar viendo»), organización de favoritos («Mi Lista») y funcionalidades avanzadas de reproducción.",
      "La plataforma se encuentra en mejora continua, por lo que algunas características, servidores externos o secciones pueden actualizarse, ajustarse o quedar temporalmente en mantenimiento para optimizar su funcionamiento.",
    ],
  },
  {
    id: "cuenta-acceso",
    title: "3. Registro y Cuenta de Usuario",
    paragraphs: [
      "Para acceder a la plataforma es necesario autenticarse mediante una cuenta válida de Google a través del protocolo Google OAuth 2.0.",
    ],
    bullets: [
      "El acceso y los beneficios de cada cuenta son estrictamente personales e intransferibles, asociados unívocamente a la dirección de correo de Google utilizada para ingresar.",
      "El usuario es responsable de mantener el control sobre su cuenta de Google y de cerrar sesión cuando utilice dispositivos compartidos o públicos.",
      "La activación de una suscripción paga queda vinculada únicamente a la cuenta de Google que originó el proceso de compra (criterio estricto de una suscripción por cuenta).",
    ],
  },
  {
    id: "planes-suscripcion",
    title: "4. Planes de Acceso y Suscripción Mensual Piloto Plus",
    paragraphs: [
      "PILOTO Streaming ofrece un Plan Gratuito de acceso básico y una suscripción mensual opcional denominada Piloto Plus / Pro ($ 2.500 ARS por ciclo de 30 días).",
    ],
    bullets: [
      "Plan Gratuito: acceso al catálogo con límites estándar en historial reciente, Mi Lista y funciones básicas.",
      "Suscripción Piloto Plus ($ 2.500 ARS / mes): habilita el Modo Escudo con experiencia en nuestro propio reproductor, transmisión a Smart TV (Chromecast y AirPlay), Modo Maratón en series (Saltar Intro y reproducción continua), historial Cloud ilimitado y Mi Lista sin restricciones.",
      "El pago cubre el uso de las herramientas de reproducción y servicios en la nube durante el período contratado.",
    ],
  },
  {
    id: "pagos-vigencia",
    title: "5. Pagos en MercadoPago, Vigencia de 30 Días y Renovación",
    paragraphs: [
      "Los pagos de Piloto Plus se procesan exclusivamente mediante MercadoPago Checkout Pro en pesos argentinos ($ 2.500 ARS).",
    ],
    bullets: [
      "Activación: una vez que MercadoPago confirma la acreditación del pago (estado aprobado), la membresía Piloto Plus se activa automáticamente en la cuenta de Google que inició el pago y se envía un correo de confirmación.",
      "Duración exacta: cada abono mensual otorga treinta (30) días corridos de vigencia contados desde la fecha y hora de aprobación del pago.",
      "Vencimiento y renovación: al cumplirse los 30 días corridos, la cuenta vuelve de manera automática al Plan Gratuito salvo que el usuario realice una nueva contratación mensual. No realizamos débitos automáticos ocultos sin intervención del usuario.",
      "Soporte de facturación o inconvenientes con un cobro: ante cualquier consulta o solicitud relacionada con un pago aprobado, podés escribirnos a facundotomas018@gmail.com indicando el correo de tu cuenta y el comprobante de MercadoPago.",
    ],
  },
  {
    id: "uso-aceptable",
    title: "6. Uso Aceptable y Conductas Prohibidas",
    paragraphs: [
      "El usuario se compromete a utilizar PILOTO Streaming de forma lícita y respetuosa de la infraestructura tecnológica. Queda expresamente prohibido:",
    ],
    bullets: [
      "Realizar scraping automatizado, consultas masivas abusivas o ataques de denegación de servicio contra los endpoints de la aplicación.",
      "Intentar vulnerar los mecanismos de autenticación, firmas HMAC, tokens temporales de streaming, protección CSRF/SSRF o límites de uso.",
      "Alterar o manipular parámetros de pago con el fin de acreditar membresías sin un pago válidamente aprobado por MercadoPago.",
      "PILOTO Streaming se reserva el derecho de suspender o limitar el acceso ante usos fraudulentos o maliciosos que comprometan la seguridad del servicio o de otros usuarios.",
    ],
  },
  {
    id: "disponibilidad-responsabilidad",
    title: "7. Disponibilidad del Servicio y Enlaces de Terceros",
    paragraphs: [
      "Si bien trabajamos para mantener el servicio operativo las 24 horas con múltiples servidores de respaldo, no garantizamos disponibilidad ininterrumpida ante fallas de conectividad, mantenimiento de infraestructura o indisponibilidad temporal de proveedores externos.",
      "PILOTO Streaming no se responsabiliza por interrupciones imputables a proveedores externos de alojamiento, redes de Internet del usuario o pasarelas de terceros.",
    ],
  },
  {
    id: "propiedad-intelectual",
    title: "8. Propiedad Intelectual y Marca",
    paragraphs: [
      "La arquitectura de software, el diseño de interfaz, el código fuente, los textos legales y los elementos identificatorios de PILOTO Streaming son titularidad de su creador o cuentan con las autorizaciones correspondientes para su operación.",
      "Queda prohibida la reproducción, redistribución o reutilización comercial del código o de la marca sin autorización previa por escrito.",
    ],
  },
  {
    id: "modificaciones-contacto",
    title: "9. Modificaciones, Legislación Aplicable y Contacto",
    paragraphs: [
      "Nos reservamos la facultad de actualizar estas Condiciones de Servicio cuando resulte necesario por mejoras técnicas, cambios operativos o exigencias legales. Las modificaciones entrarán en vigencia desde su publicación en https://cine-ddbt.vercel.app/condiciones.",
      "Estas condiciones se rigen por las leyes vigentes de la República Argentina. Ante cualquier duda, sugerencia o reclamo podés contactarte directamente a facundotomas018@gmail.com.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalDocumentLayout
      title="Condiciones de Servicio"
      intro="Estos términos establecen las reglas de acceso, uso de cuentas de Google, suscripción mensual Piloto Plus y responsabilidades aplicables al uso de PILOTO Streaming."
      lastUpdated="16 de noviembre de 2026"
      currentPath="/condiciones"
      sections={TERMS_SECTIONS}
    />
  );
}
