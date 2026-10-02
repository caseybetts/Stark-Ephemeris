import { defineConfig } from "vite";

const repositoryBase = "/Stark-Ephemeris/";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? repositoryBase : "/",
  server: {
    host: "127.0.0.1",
  },
});
