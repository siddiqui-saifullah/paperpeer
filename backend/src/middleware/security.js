import helmet from 'helmet';

export const securityHeaders = ({ secureCookies }) =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    strictTransportSecurity: secureCookies,
    referrerPolicy: { policy: 'same-origin' },
  });
