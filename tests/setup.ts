// Environnement de test : base dédiée, fournisseur mail factice, coordonnées bancaires fictives.
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://ancre:ancre_dev_pw@localhost:5432/ancremail_test?schema=public",
  MAIL_DOMAIN: "agents.test",
  MAIL_PROVIDER: "mock",
  INBOUND_WEBHOOK_SECRET: "test-inbound-secret-0123456789abcdef0123",
  BANK_ACCOUNT_HOLDER: "AncreMail Test",
  BANK_IBAN: "FR76 3000 6000 0112 3456 7890 189",
  BANK_BIC: "AGRIFRPP",
  ADMIN_EMAILS: "admin@ancremail.test",
});
