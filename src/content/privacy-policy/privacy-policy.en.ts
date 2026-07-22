import type { PrivacyPolicyDocument } from "./types";

export const privacyPolicyEn: PrivacyPolicyDocument = {
  locale: "en",
  htmlLang: "en",
  alternateLocale: "es",
  alternatePath: "/es/politica-de-privacidad",
  metadata: {
    title: "Privacy Policy | Leadiva AI",
    description:
      "Learn how Leadiva AI collects, uses, protects, and manages personal information and data synchronized through authorized integrations.",
    openGraphLocale: "en_US",
    alternateOpenGraphLocale: "es_SV",
  },
  chrome: {
    languageSelectAriaLabel: "Select the language of the Privacy Policy",
  },
  hero: {
    eyebrow: "Public document",
    title: "Privacy Policy",
    introduction:
      "This policy explains in plain language how Leadiva AI handles information used to centralize commercial opportunities and leads within an internal pipeline.",
  },
  toc: {
    title: "Contents",
    ariaLabel: "Privacy Policy table of contents",
  },
  sections: [
    {
      id: "introduction",
      title: "Introduction",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI is an internal B2B platform of Creativa Studios used to record, organize, assign, and follow up on commercial opportunities and leads. This policy applies to authorized platform users and, where relevant, to people whose information is added through forms or authorized integrations.",
        },
        {
          type: "paragraph",
          text: "It explains what information is collected or expected to be collected, where it comes from, why it is used, how it may be shared, how long it is retained, how it is protected, and how a person may request access, correction, or deletion.",
        },
      ],
    },
    {
      id: "controller",
      title: "Data controller",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI is the product name. The responsible legal entity is Creativa Consultores S.A. de C.V., with its registered address at Colonia San Benito, Avenida La Capilla #321, San Salvador, El Salvador. The contact email appears in the contact section.",
        },
        {
          type: "paragraph",
          text: "The platform is operated under the trade name Creativa Studios in El Salvador. The controller acts in accordance with the law applicable to each operation.",
        },
      ],
      showContactCard: true,
    },
    {
      id: "information-collected",
      title: "Information we collect",
      blocks: [
        {
          type: "subsection",
          title: "Account information",
          paragraphs: [
            "The current code records first name, last name, email address, role, category preferences, account status, an optional profile image, and internal identifiers. Authentication uses first-party credentials and JWT sessions.",
          ],
          items: [
            "First and last name.",
            "Authorized business email address.",
            "Role, account preferences, and selected interests.",
            "Internal identifiers, status, and creation or update dates.",
            "Authentication information needed to operate the session.",
          ],
        },
        {
          type: "note",
          tone: "info",
          title: "Passwords",
          text: "Passwords are stored as hashes using bcrypt; they must not be retained or logged in plain text.",
        },
        {
          type: "subsection",
          title: "Commercial information",
          items: [
            "Recorded opportunities, organizations, and sources.",
            "Pipeline stages, assigned owners, and follow-up notes.",
            "Status-change history, dismissals, and related activities.",
            "Qualification, conversion, amount, and date information when available.",
            "Search queries, results, verification evidence, and execution metrics.",
          ],
        },
        {
          type: "subsection",
          title: "Information obtained through the LinkedIn Lead Sync API",
          paragraphs: [
            "This category is conditional: LinkedIn Lead Sync is not yet implemented in the reviewed code. If enabled, it may only process responses for accounts, forms, and assets for which the authenticated administrator has sufficient permissions.",
          ],
          items: [
            "Responses voluntarily submitted through LinkedIn Lead Gen Forms.",
            "First and last name, email, telephone, company, job title, city, or country when requested by the form.",
            "Answers to custom questions and hidden fields configured by the advertiser.",
            "Consent information and records associated with the form.",
            "Submission date and time, and the lead source or type when provided by LinkedIn.",
            "Form, ad account, campaign, creative, organization, and response or submission identifiers.",
          ],
        },
        {
          type: "subsection",
          title: "LinkedIn connection information",
          paragraphs: [
            "If the integration is implemented, it may require the authenticated administrator's identifier, granted permissions, authorized accounts and organizations, connection and synchronization status and dates, synchronization records, and protected OAuth tokens.",
          ],
        },
        {
          type: "note",
          tone: "warning",
          title: "Integration credentials",
          text: "Tokens, secrets, and credentials must not be displayed in the interface or written to public logs. Secure storage, revocation, and deletion must be verified before LinkedIn is enabled.",
        },
        {
          type: "subsection",
          title: "Technical information",
          paragraphs: [
            "The current application uses essential session cookies, account and commercial-record timestamps, search execution states and metrics, error events, and opportunity status histories. We did not find first-party database fields for IP address, browser, device, or operating system, or analytics or marketing SDKs.",
            "Hosting infrastructure may create additional technical logs depending on its configuration. That configuration and provider must be confirmed before stating that IP addresses, user agents, or other device data are collected.",
          ],
        },
      ],
    },
    {
      id: "sources",
      title: "How we obtain information",
      blocks: [
        {
          type: "paragraph",
          text: "Information may come from the following sources, depending on the features that are enabled:",
        },
        {
          type: "list",
          items: [
            "Information provided directly when an account is created or updated.",
            "Information entered manually by authorized personnel in Leadiva AI.",
            "Public web sources and the public COMPRASAL API used to discover opportunities.",
            "Responses submitted through authorized LinkedIn forms, only if the future integration is enabled.",
            "Information generated while using the platform, such as stages, notes, assignments, searches, and history.",
            "Authentication, database, and infrastructure information needed to provide the service.",
            "Technical events generated by systems for security, diagnostics, and operation.",
          ],
        },
      ],
    },
    {
      id: "purposes",
      title: "Purposes of processing",
      blocks: [
        {
          type: "paragraph",
          text: "We process information only when needed for legitimate operational purposes of Leadiva AI, including:",
        },
        {
          type: "list",
          items: [
            "Creating and managing accounts and providing authorized access.",
            "Recording, organizing, searching for, and evaluating commercial opportunities.",
            "Synchronizing authorized leads when an integration is enabled.",
            "Assigning owners and following up on the pipeline.",
            "Sending internal notifications when that feature is enabled.",
            "Preventing duplicate records and preserving attribution and traceability.",
            "Preparing internal reports and measuring results or conversions.",
            "Maintaining security, access controls, operational history, and diagnostics.",
            "Resolving errors, incidents, and support requests.",
            "Preventing fraud, abuse, and unauthorized access.",
            "Complying with applicable legal obligations and improving the platform.",
          ],
        },
      ],
    },
    {
      id: "artificial-intelligence",
      title: "Artificial intelligence",
      blocks: [
        {
          type: "paragraph",
          text: "The current code uses Google Cloud Vertex AI and Gemini models to discover sources and to extract, classify, summarize, and verify commercial opportunities. Depending on the feature, the user's query, selected interest categories, public opportunity content, and technical metadata related to its source may be sent to the provider.",
        },
        {
          type: "paragraph",
          text: "We found no LinkedIn Lead Sync implementation and no code that sends LinkedIn Lead Gen Forms responses to an AI provider. If that practice changes, it must be assessed, documented, and communicated before it enters production.",
        },
        {
          type: "paragraph",
          text: "AI outputs may be incomplete or contain errors. Users should review relevant information; the reviewed code does not demonstrate mandatory human review of every output. AI must not be used on its own to make legal decisions or decisions that produce significant effects on a person.",
        },
      ],
    },
    {
      id: "legal-basis",
      title: "Legal basis or grounds for processing",
      blocks: [
        {
          type: "paragraph",
          text: "The appropriate ground depends on the information, the relationship with the person, and the applicable jurisdiction. Where relevant, it may include consent, performance of a contractual relationship, legitimate interests connected with operating and securing a business tool, compliance with legal obligations, or information voluntarily submitted through a form.",
        },
        {
          type: "paragraph",
          text: "Processing will be carried out under applicable law, including Salvadoran data protection rules where they apply. This policy does not state that one legal basis is valid for every processing activity or in every jurisdiction.",
        },
      ],
    },
    {
      id: "linkedin",
      title: "LinkedIn integration",
      blocks: [
        {
          type: "list",
          items: [
            "LinkedIn is an independent service with its own terms and privacy policy.",
            "The connection will use OAuth and will require sufficient permissions for the authorized accounts and forms.",
            "Leadiva AI will process only authorized responses for Creativa Studios' internal business development activities as a Direct Advertiser.",
            "Leadiva AI is not sponsored or endorsed by LinkedIn unless expressly authorized.",
            "The API will not be used for scraping, profile searches, collection of public posts, or access to private messages.",
            "The information will not be used for individually targeted advertising and will not be sold, rented, or distributed as lead lists.",
            "The integration may be disconnected; doing so must stop future synchronizations and remove related notification subscriptions.",
            "Tokens and linked data must be deleted when appropriate unless a valid legal retention duty applies.",
          ],
        },
        {
          type: "externalLink",
          label: "LinkedIn Privacy Policy",
          href: "https://www.linkedin.com/legal/privacy-policy",
          description: "Review the privacy practices of the independent LinkedIn service directly.",
        },
      ],
    },
    {
      id: "cookies",
      title: "Cookies and local storage",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI uses cookies that are strictly necessary for authentication and session security. This page's language selector stores the ES/EN preference in a functional cookie and local storage so that the choice persists across reloads and navigation.",
        },
        {
          type: "list",
          items: [
            "Authentication and JWT session cookies required for authorized users.",
            "A Privacy Policy language preference cookie.",
            "Session storage used by limited navigation features within the application.",
          ],
        },
        {
          type: "paragraph",
          text: "We found no first-party analytics or marketing cookie SDK or configuration. If either is added, this policy and any legally required consent controls must be updated before use.",
        },
      ],
    },
    {
      id: "sharing",
      title: "How we share information",
      blocks: [
        {
          type: "paragraph",
          text: "Access is limited to authorized Creativa Studios personnel and providers needed to operate the platform. Depending on confirmed features and contracts, provider categories may include infrastructure and databases, authentication, email or notifications, monitoring or logging, artificial intelligence, and LinkedIn within the operation of its integration.",
        },
        {
          type: "paragraph",
          text: "The technical provider inventory is kept in the legal configuration for review and is not automatically published as a list of processors. No configured email, analytics, marketing, or monitoring provider was found. Names, roles, regions, scopes, and contracts must be confirmed before a final list is published.",
        },
        {
          type: "paragraph",
          text: "We may also disclose information to an authority when required by a valid legal duty or competent order, or when necessary to protect rights and safety under the law.",
        },
      ],
    },
    {
      id: "sale-of-data",
      title: "Sale of data",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI does not sell or rent personal data and does not distribute lead lists to data brokers. Data obtained from LinkedIn in the future will be used only for the authorized internal purposes described in this policy.",
        },
      ],
    },
    {
      id: "international-transfers",
      title: "International transfers",
      blocks: [
        {
          type: "paragraph",
          text: "Some technology providers may process information outside El Salvador. We do not identify specific countries or regions until the production configuration and relevant contracts are confirmed. Appropriate contractual, technical, and organizational measures will be used where required under applicable law.",
        },
      ],
    },
    {
      id: "retention",
      title: "Data retention",
      blocks: [
        {
          type: "paragraph",
          text: "The repository does not define or implement automatic deletion periods for every category. Data must not be retained longer than necessary for the stated purposes, legal obligations, security, dispute resolution, or the defense of claims.",
        },
      ],
      showRetentionTable: true,
    },
    {
      id: "security",
      title: "Security",
      blocks: [
        {
          type: "paragraph",
          text: "We apply or plan to apply reasonable measures appropriate to the environment and risk, without guaranteeing that any system is invulnerable. The code confirms password hashing, signed sessions, email-domain restrictions, role-based access controls, input validation, and defenses for outbound web requests.",
        },
        {
          type: "list",
          items: [
            "Encryption in transit through HTTPS in the production deployment, which must be confirmed.",
            "Protection of stored data where supported and confirmed by the configured infrastructure.",
            "Role-based access control and least-privilege principles.",
            "Password hashing and protection of secrets, sessions, and credentials.",
            "Operational logging, change history, and monitoring subject to production configuration.",
            "Backups and restoration procedures to be confirmed with the infrastructure provider.",
            "Incident management, dependency updates, and session or token revocation.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "Individual rights",
      blocks: [
        {
          type: "paragraph",
          text: "Under applicable law, a person may request access to their data, correction or rectification, deletion or erasure, objection to certain processing, restriction, portability where applicable, withdrawal of consent, and the ability to submit a question or complaint.",
        },
        {
          type: "paragraph",
          text: "Requests may be sent to the email listed in the contact section. We will ask only for information reasonably needed to verify identity and scope, and will respond within the applicable legal period. Some information may be retained when a valid legal duty or legitimate security, dispute-resolution, or claims-defense need applies.",
        },
      ],
    },
    {
      id: "deletion",
      title: "Data deletion and disconnecting LinkedIn",
      blocks: [
        {
          type: "paragraph",
          text: "A person may request deletion of an account, personal data, or information obtained through LinkedIn by writing to the contact email. After a valid request, we will delete or anonymize the information unless a valid legal retention obligation applies.",
        },
        {
          type: "paragraph",
          text: "If LinkedIn Lead Sync is enabled, an administrator must be able to disconnect the integration in Leadiva AI and revoke authorization from LinkedIn. Disconnection must stop future synchronizations, remove related subscriptions, and permit stored tokens and linked data to be revoked or deleted where appropriate.",
        },
      ],
    },
    {
      id: "children",
      title: "Children's privacy",
      blocks: [
        {
          type: "paragraph",
          text: "Leadiva AI is an internal business tool and is not directed to minors. The application does not currently implement general age verification for every person whose information might appear in a lead.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      blocks: [
        {
          type: "paragraph",
          text: "We may update this policy to reflect legal, technical, or operational changes. We will revise the last-updated date and, where appropriate, communicate material changes within the platform or by email.",
        },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      blocks: [
        {
          type: "paragraph",
          text: "For privacy questions, rights requests, data deletion, or general assistance, email hi@creativastudios.us. Do not send passwords, tokens, or unnecessary documentation by email.",
        },
      ],
      showContactCard: true,
    },
  ],
  retention: {
    caption: "Data retention periods",
    headers: {
      category: "Category",
      period: "Period",
      justification: "Justification",
      finalAction: "End-of-period action",
    },
    rows: {
      accountInformation: {
        category: "Account information",
        justification: "Operating the account, security, and applicable obligations.",
        finalAction: "Delete or anonymize unless legally required retention applies.",
      },
      activeLeads: {
        category: "Active leads",
        justification: "Managing current opportunities and commercial follow-up.",
        finalAction: "Close, archive, anonymize, or delete under the approved policy.",
      },
      closedLeads: {
        category: "Closed leads",
        justification: "Reporting, attribution, disputes, and applicable obligations.",
        finalAction: "Delete or anonymize when the approved period expires.",
      },
      linkedinResponses: {
        category: "LinkedIn responses",
        justification: "Managing authorized leads and preserving attribution.",
        finalAction: "Delete or anonymize, including linked information where appropriate.",
      },
      oauthTokens: {
        category: "OAuth tokens",
        justification: "Maintaining an authorized integration while it is active.",
        finalAction: "Revoke and delete upon disconnection, expiry, or when no longer needed.",
      },
      auditLogs: {
        category: "Audit logs",
        justification: "Security, traceability, and incident investigation.",
        finalAction: "Delete or anonymize under documented integrity controls.",
      },
      technicalLogs: {
        category: "Technical logs",
        justification: "Diagnostics, availability, and operational security.",
        finalAction: "Delete or aggregate when no longer needed.",
      },
      privacyRequests: {
        category: "Privacy requests",
        justification: "Handling a request and documenting its management.",
        finalAction: "Minimize or delete unless evidence must legally be retained.",
      },
      backups: {
        category: "Backups",
        justification: "Continuity and incident recovery.",
        finalAction: "Overwrite or delete under the approved backup cycle.",
      },
    },
    footnote:
      "Automatic deletion and backup cycles are not demonstrated by the reviewed code. Owners, periods, and verifiable procedures must be defined before publishing the final version.",
  },
  contact: {
    title: "Controller details",
    pendingLabel: "Pending",
    labels: {
      legalEntity: "Legal name",
      tradeName: "Trade name",
      country: "Country",
      address: "Legal address",
      email: "Email",
    },
  },
  backToTop: "Back to top",
};
