import type { Metadata } from "next";
import LegalDocumentLayout, {
  LegalSectionItem,
} from "@/components/LegalDocumentLayout";
import { SITE_URL } from "@/config/seo";

export const metadata: Metadata = {
  title: "Políticas y Privacidad",
  description:
    "Política de Privacidad, Protección de Datos Personales, Google OAuth 2.0, Pagos con MercadoPago, Cookies y Derechos del Usuario en PILOTO Streaming.",
  alternates: {
    canonical: "/privacidad",
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
    title: "Políticas y Privacidad | PILOTO Streaming",
    description:
      "Conoce cómo recopilamos, utilizamos y protegemos tus datos personales, tu cuenta de Google y tus pagos en PILOTO Streaming.",
    url: `${SITE_URL}/privacidad`,
    siteName: "PILOTO Streaming",
    locale: "es_AR",
    type: "article",
    images: [{ url: "/logo.jpg", alt: "PILOTO Streaming" }],
  },
};

const POLICY_SECTIONS: LegalSectionItem[] = [
  {
    id: "responsable",
    title: "1. Responsable del Tratamiento e Información General",
    paragraphs: [
      `PILOTO Streaming (disponible en ${SITE_URL}) respeta la privacidad de sus usuarios y se compromete a proteger los datos personales recopilados durante el uso de la plataforma, en cumplimiento de los principios de transparencia, finalidad, minimización y seguridad de la información (incluyendo la Ley N.º 25.326 de Protección de Datos Personales de la República Argentina).`,
      "El responsable de la plataforma es Facundo Argüello. Para cualquier consulta, reclamo o solicitud vinculada con esta Política de Privacidad, podés comunicarte en cualquier momento por correo electrónico a facundotomas018@gmail.com.",
    ],
  },
  {
    id: "datos-recopilados",
    title: "2. Datos Personales que Recopilamos",
    paragraphs: [
      "Al iniciar sesión y utilizar PILOTO Streaming únicamente recopilamos los datos estrictamente necesarios para operar tu cuenta:",
    ],
    bullets: [
      "Datos de identificación mediante Google OAuth 2.0: dirección de correo electrónico, nombre para mostrar, imagen de perfil pública e identificador único de cuenta Google (googleId). Nunca solicitamos ni almacenamos la contraseña de tu cuenta de Google.",
      "Datos de actividad en la plataforma: progreso de reproducción de películas y episodios («Continuar viendo»), colección local «Mi Lista», y estado de tu suscripción (Plan Gratuito o Piloto Plus / Pro, fecha de activación y fecha de vencimiento mensual).",
      "Registros técnicos y seguridad: cabeceras HTTP esenciales, dirección IP procesada en memoria para limitación de tasa de solicitudes (rate limiting) y prevención de abuso o accesos automatizados maliciosos.",
    ],
  },
  {
    id: "finalidad",
    title: "3. Finalidad del Uso de la Información",
    paragraphs: [
      "Utilizamos tus datos personales exclusivamente para las siguientes finalidades legítimas:",
    ],
    bullets: [
      "Autenticar tu identidad de forma segura mediante Google OAuth 2.0 y mantener tu sesión activa.",
      "Sincronizar tu progreso de reproducción y tus preferencias personales en todos tus dispositivos.",
      "Reconocer de manera unívoca el estado de tu membresía (Gratuita o Piloto Plus) asociada a tu cuenta de Google (bajo criterio estricto de una suscripción por cuenta).",
      "Enviar correos electrónicos transaccionales indispensables, como la bienvenida inicial y la confirmación detallada al activar una suscripción.",
      "Proteger la integridad del servicio contra fraudes, falsificación de solicitudes (CSRF), redirecciones no autorizadas (SSRF), hotlinking y abuso de API.",
    ],
  },
  {
    id: "pagos-mercadopago",
    title: "4. Procesamiento de Pagos y Suscripciones (MercadoPago)",
    paragraphs: [
      "Las suscripciones mensuales a Piloto Plus ($ 2.500 ARS por ciclo de 30 días) se procesan externamente a través de MercadoPago Checkout Pro.",
      "PILOTO Streaming no solicita, procesa ni almacena datos de tarjetas de crédito o débito, códigos de seguridad (CVV), CBU/CVU ni credenciales bancarias. Toda esa información sensible es gestionada bajo los estándares PCI-DSS de MercadoPago.",
      "Únicamente registramos el identificador de operación de pago (paymentId) devuelto por la API oficial de MercadoPago, el estado de aprobación, la fecha de acreditación y la fecha de renovación o vencimiento a 30 días para habilitar o finalizar automáticamente las funciones de la cuenta correspondiente.",
    ],
  },
  {
    id: "comparticion-terceros",
    title: "5. Proveedores Tecnológicos y No Comercialización de Datos",
    paragraphs: [
      "PILOTO Streaming no vende, alquila ni cede bases de datos o información personal de sus usuarios a anunciantes ni terceros con fines comerciales.",
      "Solo interactuamos con proveedores tecnológicos esenciales para prestar el servicio bajo sus propias garantías de seguridad:",
    ],
    bullets: [
      "Google LLC (Google OAuth 2.0): verificación de identidad de inicio de sesión.",
      "MercadoPago: procesamiento de pagos y verificación del estado de transacciones.",
      "Infraestructura Cloud y Base de Datos (Vercel y PostgreSQL / Supabase): alojamiento web seguro y almacenamiento cifrado de cuentas, historial y membresías.",
      "Servicio de correo transaccional (SMTP / Gmail): entrega de notificaciones de bienvenida y confirmación de suscripción al correo registrado.",
    ],
  },
  {
    id: "cookies-almacenamiento",
    title: "6. Cookies y Almacenamiento Local",
    paragraphs: [
      "Utilizamos únicamente cookies técnicas esenciales cifradas (cookies HTTP-only de sesión JWT emitidas por NextAuth.js con vigencia máxima de 30 días) para recordar que iniciaste sesión y proteger tus solicitudes contra ataques CSRF.",
      "Asimismo, empleamos almacenamiento local del navegador (localStorage) para guardar tu lista de favoritos («Mi Lista») y preferencias de visualización. No utilizamos cookies de seguimiento publicitario propio.",
    ],
  },
  {
    id: "seguridad",
    title: "7. Medidas de Seguridad y Conservación de Datos",
    paragraphs: [
      "Implementamos controles técnicos y organizativos para resguardar la información de los usuarios:",
    ],
    bullets: [
      "Cifrado en tránsito HTTPS/TLS obligatorio con cabecera Strict-Transport-Security (HSTS).",
      "Tokens de reproducción temporales cifrados mediante AES-256-GCM y firmas criptográficas HMAC-SHA256 en referencias de pago.",
      "Cabeceras HTTP de protección (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) y validación de origen en mutaciones.",
      "Conservamos tus datos únicamente mientras tu cuenta permanezca activa o mientras sea necesario para brindar el soporte solicitado y cumplir con obligaciones legales aplicables.",
    ],
  },
  {
    id: "derechos-usuario",
    title: "8. Derechos del Usuario (Acceso, Rectificación y Eliminación)",
    paragraphs: [
      "Como titular de tus datos personales, tenés derecho en todo momento a acceder a tu información registrada, solicitar la corrección de datos inexactos o pedir la eliminación completa de tu cuenta, historial de reproducción y registro de membresía.",
      "Podés ejercer cualquiera de estos derechos escribiendo a facundotomas018@gmail.com desde el correo electrónico asociado a tu cuenta. Además, podés revocar el acceso de PILOTO Streaming en cualquier instante desde el apartado de Seguridad y Acceso de terceros de tu Cuenta de Google.",
    ],
  },
  {
    id: "actualizaciones",
    title: "9. Menores de Edad y Actualizaciones",
    paragraphs: [
      "El uso de PILOTO Streaming está destinado a personas mayores de 18 años o menores que cuenten con autorización y supervisión de un adulto responsable.",
      `PILOTO Streaming podrá actualizar esta Política de Privacidad para reflejar mejoras técnicas, nuevos requisitos legales o cambios en los servicios integrados. Cualquier modificación sustancial será publicada en esta misma URL (${SITE_URL}/privacidad) con su fecha de vigencia actualizada.`,
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      title="Políticas y Privacidad"
      intro="Este documento describe de manera clara cómo recopilamos, utilizamos, almacenamos y protegemos los datos personales de quienes utilizan PILOTO Streaming."
      lastUpdated="16 de noviembre de 2026"
      currentPath="/privacidad"
      sections={POLICY_SECTIONS}
    />
  );
}
