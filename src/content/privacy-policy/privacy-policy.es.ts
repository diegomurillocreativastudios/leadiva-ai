import type { PrivacyPolicyDocument } from "./types";

export const privacyPolicyEs: PrivacyPolicyDocument = {
  locale: "es",
  htmlLang: "es-SV",
  alternateLocale: "en",
  alternatePath: "/en/privacy-policy",
  metadata: {
    title: "Política de Privacidad | Leadiva AI",
    description:
      "Conoce cómo Leadiva AI recopila, utiliza, protege y administra la información personal y los datos sincronizados mediante integraciones autorizadas.",
    openGraphLocale: "es_SV",
    alternateOpenGraphLocale: "en_US",
  },
  chrome: {
    languageSelectAriaLabel: "Seleccionar idioma de la Política de Privacidad",
  },
  hero: {
    eyebrow: "Documento público",
    title: "Política de Privacidad",
    introduction:
      "Esta política explica, con lenguaje claro, cómo Leadiva AI trata la información utilizada para centralizar oportunidades comerciales y leads dentro de un pipeline interno.",
  },
  toc: {
    title: "Contenido",
    ariaLabel: "Tabla de contenido de la Política de Privacidad",
  },
  sections: [
    {
      id: "introduccion",
      title: "Introducción",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI es una plataforma B2B interna de Creativa Studios para registrar, organizar, asignar y dar seguimiento a oportunidades comerciales y leads. Esta política aplica a las personas autorizadas que usan la plataforma y, cuando corresponda, a las personas cuyos datos se incorporan mediante formularios o integraciones autorizadas.",
        },
        {
          type: "paragraph",
          text: "Aquí explicamos qué información se recopila o se prevé recopilar, de dónde procede, para qué se utiliza, cómo puede compartirse, cuánto tiempo se conserva, cómo se protege y cómo puede solicitarse su acceso, corrección o eliminación.",
        },
      ],
    },
    {
      id: "responsable",
      title: "Responsable del tratamiento",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI es el nombre del producto. La entidad legal responsable es Creativa Consultores S.A. de C.V., con domicilio en Colonia San Benito, Avenida La Capilla #321, San Salvador, El Salvador. El correo de contacto se muestra en la sección de contacto.",
        },
        {
          type: "paragraph",
          text: "La plataforma es operada bajo el nombre comercial Creativa Studios en El Salvador. El responsable del tratamiento actúa conforme a la legislación aplicable a cada operación.",
        },
      ],
      showContactCard: true,
    },
    {
      id: "informacion-recopilada",
      title: "Información que recopilamos",
      blocks: [
        {
          type: "subsection",
          title: "Información de cuenta",
          paragraphs: [
            "El código actual registra nombre, apellido, correo electrónico, rol, preferencias de categorías, estado de la cuenta, imagen de perfil opcional e identificadores internos. La autenticación se gestiona con credenciales propias y sesiones JWT.",
          ],
          items: [
            "Nombre y apellido.",
            "Correo electrónico corporativo autorizado.",
            "Rol, preferencias de cuenta e intereses seleccionados.",
            "Identificadores internos, estado y fechas de creación o actualización.",
            "Información de autenticación necesaria para operar la sesión.",
          ],
        },
        {
          type: "note",
          tone: "info",
          title: "Contraseñas",
          text: "Las contraseñas se almacenan como hashes mediante bcrypt; no deben conservarse ni registrarse en texto plano.",
        },
        {
          type: "subsection",
          title: "Información comercial",
          items: [
            "Oportunidades, organizaciones y fuentes registradas.",
            "Estados del pipeline, responsables asignados y notas de seguimiento.",
            "Historial de cambios de estado, descartes y actividades asociadas.",
            "Información de calificación, conversión, montos y fechas cuando esté disponible.",
            "Consultas de búsqueda, resultados, evidencia de verificación y métricas de ejecución.",
          ],
        },
        {
          type: "subsection",
          title: "Información obtenida mediante LinkedIn Lead Sync API",
          paragraphs: [
            "Esta categoría es condicional: la integración LinkedIn Lead Sync todavía no está implementada en el código revisado. Si se habilita, solo podrá procesar respuestas para las cuentas, formularios y activos sobre los cuales el administrador autenticado tenga permisos suficientes.",
          ],
          items: [
            "Respuestas enviadas voluntariamente mediante LinkedIn Lead Gen Forms.",
            "Nombre, apellidos, correo, teléfono, empresa, cargo, ciudad o país cuando el formulario los solicite.",
            "Respuestas a preguntas personalizadas y campos ocultos configurados por el anunciante.",
            "Información y registros de consentimiento asociados al formulario.",
            "Fecha y hora de envío, origen o tipo de lead cuando LinkedIn lo proporcione.",
            "Identificadores de formulario, cuenta publicitaria, campaña, creatividad, organización y respuesta o envío.",
          ],
        },
        {
          type: "subsection",
          title: "Información de conexión con LinkedIn",
          paragraphs: [
            "Si la integración se implementa, podrá requerir el identificador del administrador autenticado, permisos concedidos, cuentas y organizaciones autorizadas, estado y fechas de conexión o sincronización, registros de sincronización y tokens OAuth protegidos.",
          ],
        },
        {
          type: "note",
          tone: "warning",
          title: "Credenciales de integración",
          text: "Los tokens, secretos y credenciales no deben mostrarse en la interfaz ni escribirse en logs públicos. Antes de habilitar LinkedIn debe verificarse el almacenamiento seguro, la revocación y la eliminación de esos datos.",
        },
        {
          type: "subsection",
          title: "Información técnica",
          paragraphs: [
            "La aplicación actual utiliza cookies esenciales de sesión, marcas de tiempo de cuentas y registros comerciales, estados y métricas de ejecuciones, eventos de error y registros de cambios de oportunidades. No encontramos campos propios de base de datos para guardar dirección IP, navegador, dispositivo o sistema operativo, ni SDK de analítica o marketing.",
            "La infraestructura de alojamiento podría generar logs técnicos adicionales según su configuración. Esa configuración y su proveedor deben confirmarse antes de afirmar que se recopilan direcciones IP, agentes de usuario u otros datos de dispositivo.",
          ],
        },
      ],
    },
    {
      id: "obtencion",
      title: "Cómo obtenemos la información",
      blocks: [
        {
          type: "paragraph",
          text: "La información puede proceder de las siguientes fuentes, según las funciones que estén habilitadas:",
        },
        {
          type: "list",
          items: [
            "Datos proporcionados directamente al crear o actualizar una cuenta.",
            "Información introducida manualmente por personal autorizado en Leadiva AI.",
            "Fuentes web públicas y la API pública de COMPRASAL utilizadas para descubrir oportunidades.",
            "Respuestas enviadas mediante formularios autorizados de LinkedIn, únicamente si la integración futura se habilita.",
            "Datos generados durante el uso de la plataforma, como estados, notas, asignaciones, búsquedas e historial.",
            "Información de autenticación, base de datos e infraestructura necesaria para prestar el servicio.",
            "Eventos técnicos producidos por los sistemas para seguridad, diagnóstico y operación.",
          ],
        },
      ],
    },
    {
      id: "finalidades",
      title: "Finalidades del tratamiento",
      blocks: [
        {
          type: "paragraph",
          text: "Tratamos la información solo cuando sea necesaria para finalidades operativas legítimas de Leadiva AI, entre ellas:",
        },
        {
          type: "list",
          items: [
            "Crear y administrar cuentas y proporcionar acceso autorizado.",
            "Registrar, organizar, buscar y evaluar oportunidades comerciales.",
            "Sincronizar leads autorizados cuando exista una integración habilitada.",
            "Asignar responsables y dar seguimiento al pipeline.",
            "Enviar notificaciones internas cuando esa función esté habilitada.",
            "Evitar registros duplicados y conservar atribución y trazabilidad.",
            "Preparar reportes internos y medir resultados o conversiones.",
            "Mantener seguridad, controles de acceso, historial operativo y diagnóstico.",
            "Resolver errores, incidentes y solicitudes de soporte.",
            "Prevenir fraude, abuso y accesos no autorizados.",
            "Cumplir obligaciones legales aplicables y mejorar la plataforma.",
          ],
        },
      ],
    },
    {
      id: "inteligencia-artificial",
      title: "Inteligencia artificial",
      blocks: [
        {
          type: "paragraph",
          text: "El código actual utiliza Google Cloud Vertex AI y modelos Gemini para descubrir fuentes, extraer información, clasificar, resumir y verificar oportunidades comerciales. Según la función, pueden enviarse la consulta del usuario, categorías de interés seleccionadas, contenido público de una oportunidad y metadatos técnicos relacionados con su fuente.",
        },
        {
          type: "paragraph",
          text: "No encontramos una implementación de LinkedIn Lead Sync ni código que envíe respuestas de LinkedIn Lead Gen Forms a un proveedor de IA. Si esa práctica cambiara, deberá evaluarse, documentarse y comunicarse antes de entrar en producción.",
        },
        {
          type: "paragraph",
          text: "Los resultados de IA pueden ser incompletos o contener errores. Las personas usuarias deben revisar la información relevante; el código revisado no acredita una revisión humana obligatoria de cada resultado. La IA no debe utilizarse por sí sola para adoptar decisiones legales ni decisiones que produzcan efectos significativos sobre una persona.",
        },
      ],
    },
    {
      id: "fundamento",
      title: "Base jurídica o fundamento del tratamiento",
      blocks: [
        {
          type: "paragraph",
          text: "El fundamento dependerá del tipo de información, la relación con la persona y la jurisdicción aplicable. Según corresponda, podrá incluir el consentimiento, la ejecución de una relación contractual, intereses legítimos vinculados con la operación y seguridad de una herramienta empresarial, el cumplimiento de obligaciones legales o la información enviada voluntariamente mediante un formulario.",
        },
        {
          type: "paragraph",
          text: "El tratamiento se realizará conforme a la legislación aplicable, incluida la normativa salvadoreña de protección de datos cuando corresponda. Esta política no afirma que una sola base jurídica sea válida para todos los tratamientos ni para todas las jurisdicciones.",
        },
      ],
    },
    {
      id: "linkedin",
      title: "Integración con LinkedIn",
      blocks: [
        {
          type: "list",
          items: [
            "LinkedIn es un servicio independiente y mantiene sus propios términos y política de privacidad.",
            "La conexión se realizará mediante OAuth y exigirá permisos suficientes sobre las cuentas y formularios autorizados.",
            "Leadiva AI solo procesará respuestas autorizadas para las actividades internas de desarrollo de negocios de Creativa Studios como Direct Advertiser.",
            "Leadiva AI no está patrocinada ni respaldada por LinkedIn salvo autorización expresa.",
            "La API no se utilizará para scraping, búsqueda de perfiles, recopilación de publicaciones públicas o acceso a mensajes privados.",
            "La información no se utilizará para publicidad dirigida individual ni se venderá, alquilará o distribuirá como listas de leads.",
            "La integración podrá desconectarse; al hacerlo deberán detenerse futuras sincronizaciones y eliminarse las suscripciones de notificación relacionadas.",
            "Los tokens y datos vinculados deberán eliminarse cuando corresponda, salvo una obligación legal válida de conservación.",
          ],
        },
        {
          type: "externalLink",
          label: "Política de Privacidad de LinkedIn",
          href: "https://www.linkedin.com/legal/privacy-policy",
          description: "Consulta directamente las prácticas de privacidad del servicio independiente LinkedIn.",
        },
      ],
    },
    {
      id: "cookies",
      title: "Cookies y almacenamiento local",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI utiliza cookies estrictamente necesarias para autenticación y seguridad de sesión. El selector de esta página guarda la preferencia ES/EN en una cookie funcional y en almacenamiento local para conservar la elección al recargar o navegar.",
        },
        {
          type: "list",
          items: [
            "Cookies de autenticación y sesión JWT necesarias para usuarios autorizados.",
            "Cookie de preferencia de idioma de la Política de Privacidad.",
            "Almacenamiento de sesión usado por funciones puntuales de navegación dentro de la aplicación.",
          ],
        },
        {
          type: "paragraph",
          text: "No encontramos SDK ni configuración propios de cookies de analítica o marketing. Si se incorporan en el futuro, esta política y los controles de consentimiento deberán actualizarse antes de su uso cuando la ley lo exija.",
        },
      ],
    },
    {
      id: "compartir",
      title: "Cómo compartimos información",
      blocks: [
        {
          type: "paragraph",
          text: "El acceso se limita al personal autorizado de Creativa Studios y a proveedores necesarios para operar la plataforma. Según las funciones y contratos confirmados, las categorías pueden incluir infraestructura y base de datos, autenticación, correo o notificaciones, monitoreo o logging, inteligencia artificial y LinkedIn dentro de su integración.",
        },
        {
          type: "paragraph",
          text: "El inventario técnico de proveedores se mantiene en la configuración legal para revisión y no se publica automáticamente como una lista de encargados. No se detectaron proveedores configurados de correo, analítica, marketing o monitoreo. Los nombres, roles, regiones, alcances y contratos deben confirmarse antes de publicar una lista definitiva.",
        },
        {
          type: "paragraph",
          text: "También podremos comunicar información a una autoridad cuando exista una obligación legal válida, una orden competente o sea necesario para proteger derechos y seguridad conforme a la ley.",
        },
      ],
    },
    {
      id: "venta-datos",
      title: "Venta de datos",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI no vende ni alquila datos personales y no distribuye listas de leads a data brokers. Los datos que en el futuro se obtengan de LinkedIn se utilizarán únicamente para los fines internos autorizados descritos en esta política.",
        },
      ],
    },
    {
      id: "transferencias",
      title: "Transferencias internacionales",
      blocks: [
        {
          type: "paragraph",
          text: "Algunos proveedores tecnológicos podrían procesar información fuera de El Salvador. No se indican países o regiones concretos hasta confirmar la configuración productiva y los contratos correspondientes. Cuando sea necesario, se aplicarán medidas contractuales, técnicas y organizativas apropiadas conforme a la legislación aplicable.",
        },
      ],
    },
    {
      id: "conservacion",
      title: "Conservación de datos",
      blocks: [
        {
          type: "paragraph",
          text: "No se han definido ni implementado en el repositorio periodos automáticos de eliminación para todas las categorías. Los datos no deben conservarse más tiempo del necesario para las finalidades declaradas, obligaciones legales, seguridad, resolución de disputas o defensa de reclamaciones.",
        },
      ],
      showRetentionTable: true,
    },
    {
      id: "seguridad",
      title: "Seguridad",
      blocks: [
        {
          type: "paragraph",
          text: "Aplicamos o prevemos aplicar medidas razonables según el entorno y el riesgo, sin garantizar que ningún sistema sea invulnerable. El código confirma hashing de contraseñas, sesiones firmadas, restricciones de dominio de correo, controles de acceso por rol, validación de entradas y defensas para solicitudes web externas.",
        },
        {
          type: "list",
          items: [
            "Cifrado en tránsito mediante HTTPS en el despliegue productivo que deberá confirmarse.",
            "Protección de datos almacenados cuando la infraestructura configurada lo permita y esté confirmada.",
            "Control de acceso basado en roles y principio de mínimo privilegio.",
            "Hashing de contraseñas y protección de secretos, sesiones y credenciales.",
            "Logging operativo, historial de cambios y monitoreo sujeto a la configuración productiva.",
            "Backups y procedimientos de restauración por confirmar con el proveedor de infraestructura.",
            "Gestión de incidentes, actualización de dependencias y revocación de sesiones o tokens.",
          ],
        },
      ],
    },
    {
      id: "derechos",
      title: "Derechos de las personas",
      blocks: [
        {
          type: "paragraph",
          text: "De acuerdo con la legislación aplicable, una persona puede solicitar acceso a sus datos, corrección o rectificación, eliminación o supresión, oposición a ciertos tratamientos, limitación, portabilidad cuando corresponda, retirar un consentimiento y presentar una consulta o reclamación.",
        },
        {
          type: "paragraph",
          text: "Las solicitudes podrán enviarse al correo indicado en la sección de contacto. Pediremos únicamente la información razonablemente necesaria para verificar identidad y alcance, y responderemos dentro del periodo legal aplicable. Algunos datos podrán conservarse si existe una obligación legal válida o una necesidad legítima de seguridad, resolución de disputas o defensa de reclamaciones.",
        },
      ],
    },
    {
      id: "eliminacion",
      title: "Eliminación de datos y desconexión de LinkedIn",
      blocks: [
        {
          type: "paragraph",
          text: "Puede solicitarse la eliminación de una cuenta, de datos personales o de información obtenida mediante LinkedIn escribiendo al correo de contacto. Tras una solicitud válida, eliminaremos o anonimizaremos la información salvo que exista una obligación legal válida de conservación.",
        },
        {
          type: "paragraph",
          text: "Si LinkedIn Lead Sync se habilita, el administrador deberá poder desconectar la integración en Leadiva AI y revocar la autorización desde LinkedIn. La desconexión deberá detener sincronizaciones futuras, eliminar suscripciones relacionadas y permitir la revocación o eliminación de tokens almacenados y datos vinculados cuando corresponda.",
        },
      ],
    },
    {
      id: "menores",
      title: "Privacidad de menores",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI es una herramienta empresarial interna y no está dirigida a menores de edad. La aplicación no implementa actualmente una verificación general de edad para todas las personas cuyos datos pudieran aparecer en un lead.",
        },
      ],
    },
    {
      id: "cambios",
      title: "Cambios en esta política",
      blocks: [
        {
          type: "paragraph",
          text: "Podemos actualizar esta política para reflejar cambios legales, técnicos u operativos. Modificaremos la fecha de última actualización y, cuando corresponda, comunicaremos los cambios materiales dentro de la plataforma o por correo electrónico.",
        },
      ],
    },
    {
      id: "contacto",
      title: "Contacto",
      blocks: [
        {
          type: "paragraph",
          text: "Para consultas sobre privacidad, derechos, eliminación de datos o asistencia general, escriba a hi@creativastudios.us. No envíe contraseñas, tokens ni documentación innecesaria por correo.",
        },
      ],
      showContactCard: true,
    },
  ],
  retention: {
    caption: "Periodos de conservación de datos",
    headers: {
      category: "Categoría",
      period: "Periodo",
      justification: "Justificación",
      finalAction: "Acción al finalizar",
    },
    rows: {
      accountInformation: {
        category: "Información de cuenta",
        justification: "Operar la cuenta, seguridad y obligaciones aplicables.",
        finalAction: "Eliminar o anonimizar, salvo conservación legal necesaria.",
      },
      activeLeads: {
        category: "Leads activos",
        justification: "Gestionar oportunidades y seguimiento comercial vigente.",
        finalAction: "Cerrar, archivar, anonimizar o eliminar según la política aprobada.",
      },
      closedLeads: {
        category: "Leads cerrados",
        justification: "Reportes, atribución, disputas y obligaciones aplicables.",
        finalAction: "Eliminar o anonimizar al vencer el periodo aprobado.",
      },
      linkedinResponses: {
        category: "Respuestas de LinkedIn",
        justification: "Gestionar leads autorizados y conservar atribución.",
        finalAction: "Eliminar o anonimizar, incluida la información vinculada cuando corresponda.",
      },
      oauthTokens: {
        category: "Tokens OAuth",
        justification: "Mantener una integración autorizada mientras esté activa.",
        finalAction: "Revocar y eliminar al desconectar, expirar o dejar de ser necesarios.",
      },
      auditLogs: {
        category: "Logs de auditoría",
        justification: "Seguridad, trazabilidad e investigación de incidentes.",
        finalAction: "Eliminar o anonimizar con controles de integridad documentados.",
      },
      technicalLogs: {
        category: "Logs técnicos",
        justification: "Diagnóstico, disponibilidad y seguridad operativa.",
        finalAction: "Eliminar o agregar cuando ya no sean necesarios.",
      },
      privacyRequests: {
        category: "Solicitudes de privacidad",
        justification: "Atender la solicitud y acreditar su gestión.",
        finalAction: "Minimizar o eliminar, salvo evidencia legalmente necesaria.",
      },
      backups: {
        category: "Backups",
        justification: "Continuidad y recuperación ante incidentes.",
        finalAction: "Sobrescribir o eliminar según el ciclo de backup aprobado.",
      },
    },
    footnote:
      "La eliminación automática y los ciclos de backup no están acreditados por el código revisado. Deben definirse responsables, plazos y procedimientos verificables antes de publicar la versión definitiva.",
  },
  contact: {
    title: "Datos del responsable",
    pendingLabel: "Pendiente",
    labels: {
      legalEntity: "Nombre legal",
      tradeName: "Nombre comercial",
      country: "País",
      address: "Dirección legal",
      email: "Correo",
    },
  },
  backToTop: "Volver al inicio",
};
