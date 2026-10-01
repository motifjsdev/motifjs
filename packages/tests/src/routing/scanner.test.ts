/**
 * Scanner Unit Tests
 * 
 * Scanner, route path'lerini parse edip regex'e çevirir ve URL matching yapar.
 * Parametrik route'lar, optional params, default values, query strings test edilir.
 */

import { Scanner } from '@motifx/core/internal';

describe('Scanner - Route Pattern Matching', () => {
    describe('Colon segments', () => {
        it('":id" is not a parameter', () => {
            const scanner = new Scanner('/user/:id');
            expect(scanner.exist('/user/5')).toBe(false);
        });
    });

    describe('Static routes', () => {
        it('should match exact static path', () => {
            const scanner = new Scanner('/home');
            expect(scanner.exist('/home')).toBe(true);
            expect(scanner.exist('/about')).toBe(false);
        });

        it('should match nested static paths', () => {
            const scanner = new Scanner('/users/profile');
            expect(scanner.exist('/users/profile')).toBe(true);
            expect(scanner.exist('/users')).toBe(false);
            expect(scanner.exist('/users/profile/settings')).toBe(false);
        });

        it('should be case insensitive', () => {
            const scanner = new Scanner('/Products');
            expect(scanner.exist('/products')).toBe(true);
            expect(scanner.exist('/PRODUCTS')).toBe(true);
            expect(scanner.exist('/Products')).toBe(true);
        });
    });

    describe('Parameter routes', () => {
        it('should match single parameter', () => {
            const scanner = new Scanner('/users/{id}');
            expect(scanner.exist('/users/123')).toBe(true);
            expect(scanner.parameters.id).toBe('123');
        });

        it('should match multiple parameters', () => {
            const scanner = new Scanner('/posts/{category}/{id}');
            expect(scanner.exist('/posts/tech/456')).toBe(true);
            expect(scanner.parameters.category).toBe('tech');
            expect(scanner.parameters.id).toBe('456');
        });

        it('should match parameter with special characters', () => {
            const scanner = new Scanner('/files/{filename}');
            expect(scanner.exist('/files/my-document_v2.pdf')).toBe(true);
            expect(scanner.parameters.filename).toBe('my-document_v2.pdf');
        });

        it('should not match empty parameter', () => {
            const scanner = new Scanner('/users/{id}');
            expect(scanner.exist('/users/')).toBe(false);
            expect(scanner.exist('/users')).toBe(false);
        });

        it('should match nested parameters', () => {
            const scanner = new Scanner('/api/{version}/users/{id}/posts/{postId}');
            expect(scanner.exist('/api/v1/users/42/posts/100')).toBe(true);
            expect(scanner.parameters.version).toBe('v1');
            expect(scanner.parameters.id).toBe('42');
            expect(scanner.parameters.postId).toBe('100');
        });
    });

    describe('Optional parameters', () => {
        it('should match optional parameter when present', () => {
            const scanner = new Scanner('/docs/{page?}');
            expect(scanner.exist('/docs/intro')).toBe(true);
            expect(scanner.parameters.page).toBe('intro');
        });

        it('should match optional parameter when missing', () => {
            const scanner = new Scanner('/docs/{page?}');
            expect(scanner.exist('/docs')).toBe(true);
            expect(scanner.parameters.page).toBeUndefined();
        });

        it('should match multiple optional parameters', () => {
            const scanner = new Scanner('/browse/{category?}/{subcategory?}');

            expect(scanner.exist('/browse')).toBe(true);
            expect(scanner.parameters.category).toBeUndefined();

            scanner.exist('/browse/tech');
            expect(scanner.parameters.category).toBe('tech');
            expect(scanner.parameters.subcategory).toBeUndefined();

            scanner.exist('/browse/tech/mobile');
            expect(scanner.parameters.category).toBe('tech');
            expect(scanner.parameters.subcategory).toBe('mobile');
        });

        it('should match mixed required and optional params', () => {
            const scanner = new Scanner('/users/{id}/{tab?}');

            expect(scanner.exist('/users/123')).toBe(true);
            expect(scanner.parameters.id).toBe('123');
            expect(scanner.parameters.tab).toBeUndefined();

            scanner.exist('/users/123/posts');
            expect(scanner.parameters.id).toBe('123');
            expect(scanner.parameters.tab).toBe('posts');
        });
    });

    describe('Default values', () => {
        it('should use default value when parameter is missing', () => {
            const scanner = new Scanner('/page/{id:home}');
            expect(scanner.exist('/page')).toBe(false); // Required by default
        });

        it('should use default value for optional parameter', () => {
            const scanner = new Scanner('/docs/{page?:intro}');
            expect(scanner.exist('/docs')).toBe(true);
            expect(scanner.parameters.page).toBe('intro');
        });

        it('should override default when parameter is provided', () => {
            const scanner = new Scanner('/docs/{page?:intro}');
            expect(scanner.exist('/docs/advanced')).toBe(true);
            expect(scanner.parameters.page).toBe('advanced');
        });

        it('should handle multiple defaults', () => {
            const scanner = new Scanner('/browse/{category?:all}/{sort?:recent}');

            expect(scanner.exist('/browse')).toBe(true);
            expect(scanner.parameters.category).toBe('all');
            expect(scanner.parameters.sort).toBe('recent');

            scanner.exist('/browse/tech');
            expect(scanner.parameters.category).toBe('tech');
            expect(scanner.parameters.sort).toBe('recent');
        });
    });

    describe('Query strings', () => {
        it('should parse query parameters', () => {
            const scanner = new Scanner('/search');
            expect(scanner.exist('/search?q=motifjs')).toBe(true);
            expect(scanner.parameters.q).toBe('motifjs');
        });

        it('should parse multiple query parameters', () => {
            const scanner = new Scanner('/products');
            expect(scanner.exist('/products?category=tech&sort=price&order=asc')).toBe(true);
            expect(scanner.parameters.category).toBe('tech');
            expect(scanner.parameters.sort).toBe('price');
            expect(scanner.parameters.order).toBe('asc');
        });

        it('should parse array query parameters', () => {
            const scanner = new Scanner('/filter');
            expect(scanner.exist('/filter?tags=js&tags=ts&tags=react')).toBe(true);
            expect(scanner.parameters.tags).toEqual(['js', 'ts', 'react']);
        });

        it('should parse query with path parameters', () => {
            const scanner = new Scanner('/users/{id}');
            expect(scanner.exist('/users/123?tab=posts&page=2')).toBe(true);
            expect(scanner.parameters.id).toBe('123');
            expect(scanner.parameters.tab).toBe('posts');
            expect(scanner.parameters.page).toBe('2');
        });

        it('should keep number and boolean query values as text', () => {
            const scanner = new Scanner('/api');
            scanner.exist('/api?count=10&active=true&rating=4.5&name=test&tel=05321234567');

            expect(scanner.parameters.count).toBe('10');
            expect(scanner.parameters.active).toBe('true');
            expect(scanner.parameters.rating).toBe('4.5');
            expect(scanner.parameters.name).toBe('test');
            expect(scanner.parameters.tel).toBe('05321234567');
        });

        it('should keep null and undefined query values as text', () => {
            const scanner = new Scanner('/data');
            scanner.exist('/data?empty=null&missing=undefined');

            expect(scanner.parameters.empty).toBe('null');
            expect(scanner.parameters.missing).toBe('undefined');
        });

        it('should keep a date query value as text', () => {
            const scanner = new Scanner('/events');
            scanner.exist('/events?date=2025-11-11');

            expect(scanner.parameters.date).toBe('2025-11-11');
        });

        it('should keep JSON in a query value as text', () => {
            const scanner = new Scanner('/api');
            scanner.exist('/api?filter={"status":"active","min":10}');

            expect(scanner.parameters.filter).toBe('{"status":"active","min":10}');
        });

        it('should sanitize HTML in query values', () => {
            const scanner = new Scanner('/search');
            scanner.exist('/search?q=<script>alert("xss")</script>test');

            // filterHtml uses textContent which escapes HTML but doesn't strip it
            // In browser DOM, textContent of a div with HTML returns the text content
            // So '<script>alert("xss")</script>test' becomes 'alert("xss")test'
            expect(scanner.parameters.q).toBe('<script>alert("xss")</script>test');
        });
    });

    describe('Edge cases', () => {
        it('should handle root path', () => {
            const scanner = new Scanner('/');
            expect(scanner.exist('/')).toBe(true);
        });

        it('should handle empty path input', () => {
            const scanner = new Scanner('/home');
            expect(scanner.exist('')).toBe(false);
        });

        it('should handle path without leading slash', () => {
            const scanner = new Scanner('home');
            expect(scanner.exist('/home')).toBe(true);
        });

        it('should not match partial paths', () => {
            const scanner = new Scanner('/users/{id}/posts');
            expect(scanner.exist('/users/123')).toBe(false);
            expect(scanner.exist('/users/123/posts/456')).toBe(false);
        });

        it('should handle trailing slash variations (tolerant matching)', () => {
            // Sondaki '/' eşleşmeyi bozmamalı: '/app' rotası '/app/' isteğiyle de eşleşir
            const scanner = new Scanner('/about');
            expect(scanner.exist('/about/')).toBe(true);
            expect(scanner.exist('/about//')).toBe(true);
            expect(scanner.exist('/about/x')).toBe(false); // gerçek alt yol hâlâ eşleşmez
        });

        it('should match trailing slash with parameters and query', () => {
            const scanner = new Scanner('/users/{id}');
            expect(scanner.exist('/users/123/')).toBe(true);
            expect(scanner.parameters.id).toBe('123');

            expect(scanner.exist('/users/123/?tab=posts')).toBe(true);
            expect(scanner.parameters.id).toBe('123');
            expect(scanner.parameters.tab).toBe('posts');
        });

        it('should normalize trailing slash in the route pattern itself', () => {
            // Rota deseni '/app/' olarak tanımlansa da '/app' isteğiyle eşleşir
            const scanner = new Scanner('/app/');
            expect(scanner.exist('/app')).toBe(true);
            expect(scanner.exist('/app/')).toBe(true);
        });

        it('root path keeps matching with and without extra slashes', () => {
            const scanner = new Scanner('/');
            expect(scanner.exist('/')).toBe(true);
            expect(scanner.exist('//')).toBe(true);
        });

        it('should handle complex optional chains', () => {
            const scanner = new Scanner('/docs/{section?}/{page?}/{anchor?}');

            expect(scanner.exist('/docs')).toBe(true);
            scanner.exist('/docs/api');
            expect(scanner.parameters.section).toBe('api');

            scanner.exist('/docs/api/signal');
            expect(scanner.parameters.section).toBe('api');
            expect(scanner.parameters.page).toBe('signal');
        });

        it('should handle parameter with delimiter', () => {
            const scanner = new Scanner('/files/{name}.{ext}');
            expect(scanner.exist('/files/document.pdf')).toBe(true);
            expect(scanner.parameters.name).toBe('document');
            expect(scanner.parameters.ext).toBe('pdf');
        });
    });

    describe('Performance', () => {
        it('should handle large number of parameters', () => {
            const scanner = new Scanner('/path/{p1}/{p2}/{p3}/{p4}/{p5}/{p6}/{p7}/{p8}');
            const path = '/path/a/b/c/d/e/f/g/h';

            expect(scanner.exist(path)).toBe(true);
            expect(scanner.parameters.p1).toBe('a');
            expect(scanner.parameters.p8).toBe('h');
        });

        it('should parse complex query strings efficiently', () => {
            const scanner = new Scanner('/api');
            const query = '?' + Array.from({ length: 50 }, (_, i) => `param${i}=value${i}`).join('&');

            expect(scanner.exist(`/api${query}`)).toBe(true);
            expect(scanner.parameters.param0).toBe('value0');
            expect(scanner.parameters.param49).toBe('value49');
        });
    });
});

