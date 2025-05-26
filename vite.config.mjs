import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: true,
  },
  plugins: [
    {
      name: 'embed-patches',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const patches = [
            'patches/classic_theremin.json',
            'patches/bright_saw_lead.json',
            'patches/brutal_brass_bass.json',
          ]
            .map((file) => {
              const content = readFileSync(resolve(file), 'utf-8');
              const filename = file.split('/').pop();
              return `<script type="application/json" data-patch="${filename}" id="patch-${filename}">${content}</script>`;
            })
            .join('\n');

          return html.replace('</body>', `${patches}\n</body>`);
        },
      },
    },
    viteSingleFile({
      useRecommendedBuildConfig: true,
    }),
  ],
});
