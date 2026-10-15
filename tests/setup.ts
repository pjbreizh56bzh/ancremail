// Environnement de test : base dédiée, fournisseur mail factice, Stripe en mode test fictif.
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://ancre:ancre_dev_pw@localhost:5432/ancremail_test?schema=public",
  MAIL_DOMAIN: "agents.test",
  MAIL_PROVIDER: "mock",
  INBOUND_WEBHOOK_SECRET: "test-inbound-secret-0123456789abcdef0123",
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_test_dummy",
  STRIPE_PRICE_PRO: "price_pro_test",
  STRIPE_PRICE_SCALE: "price_scale_test",
  ALLOW_LIVE_PAYMENTS: "false",
});
