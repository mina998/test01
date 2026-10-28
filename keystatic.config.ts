// keystatic.config.ts
import { config, fields, collection } from '@keystatic/core';

export default config({
    storage: {
        kind: 'local',
    },
    collections: {
        // 文章
        posts: collection({
            label: 'Posts',
            slugField: 'title',
            path: 'src/content/posts/*',
            format: { contentField: 'content' },
            entryLayout: 'content',
            schema: {
                title: fields.slug({ name: { label: 'Title' } }),
                date: fields.date({ label: 'Date' }),
                author: fields.text({ label: 'Author' }),
                tags: fields.text({ label: 'Tags' }),
                cover: fields.image({ label: 'Cover' }),
                description: fields.text({ label: 'Description' }),
                category: fields.text({ label: 'Category' }),
                content: fields.markdoc({ label: 'Content' }),
            },
        }),
        // ---
    },
});
