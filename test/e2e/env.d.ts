declare namespace NodeJS {
  interface ProcessEnv {
    PLAYWRIGHT_BASE_URL: string
    PLAYWRIGHT_COOKIE_SECRET: string
    PLAYWRIGHT_DB_URL: string
  }
}
