// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// El dominio real se pone en la variable SITE de Netlify; el valor de aqui es el de por
// defecto para que el sitemap y las URLs canonicas funcionen en local.
const site = process.env.SITE ?? process.env.URL ?? 'https://dapper-empanada-bb361f.netlify.app';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
