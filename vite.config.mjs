import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static';

  return {
    build: {
      outDir: isStatic ? 'dist/static' : 'dist/dynamic',
      minify: isStatic,
    },

    plugins: [
      // For static builds, embed patches in HTML
      isStatic && {
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
                return `<script type="application/json" data-patch="${filename}">${content}</script>`;
              })
              .join('\n');

            return html.replace('</body>', `${patches}\n</body>`);
          },
        },
      },

      // Then let vite-plugin-singlefile inline everything
      isStatic &&
        viteSingleFile({
          useRecommendedBuildConfig: true,
        }),
    ].filter(Boolean),
  };
});
