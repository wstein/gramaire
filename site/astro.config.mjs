import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://wstein.github.io/grammark/',
  base: '/grammark/',
  integrations: [
    starlight({
      title: 'Grammark',
      description: 'Grammars that render themselves.',
      sidebar: [
        { label: 'Home', link: '/' },
        { label: 'Docs', autogenerate: { directory: 'docs' } },
        { label: 'Specs', autogenerate: { directory: 'specs' } },
        { label: 'Tutorials', autogenerate: { directory: 'tutorials' } },
        { label: 'Lab', link: '/lab' },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
