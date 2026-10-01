# motifjs tarayıcı benchmark düzeneği

jsdom tabanlı `component.benchmark.test.ts` / `benchmark.routing.test.ts` ölçümleri
güvenilir değildir (duvar-saat + sahte DOM). Gerçek performans ölçümü bu düzenekle,
gerçek tarayıcıda yapılır.

## Senaryolar (js-framework-benchmark uyumlu)

- `create-1k` / `create-10k` — 1.000 / 10.000 satır oluştur
- `append-1k` — mevcut listeye 1.000 satır ekle
- `update-every-10th` — her 10. satırın label'ını değiştir
- `swap-rows` — satır 2 ile 999'un yerini değiştir (LIS minimal-taşıma testi)
- `remove-row` — ortadan satır sil
- `clear` — tüm listeyi temizle

Ölçüm: işlem başlangıcından çift `requestAnimationFrame` (boyama tamamlandı) sonrasına
kadar; "TÜMÜNÜ KOŞ" 5 tekrar yapıp medyanı raporlar.

## Çalıştırma

1. `npm run build --workspace=@motifx/core` (düzenek `packages/motifjs/dist/index.umd.js`'i yükler)
2. `packages/tests/bench/index.html`'i tarayıcıda aç (file:// çalışır) ya da repo kökünden
   bir statik sunucu başlat: `npx serve .` → `http://localhost:3000/packages/tests/bench/`
3. "TÜMÜNÜN KOŞ" ile tabloda medyan süreleri oku; konsola ham örnekler yazılır.

## Kabul ölçütü (Faz 2)

`swap-rows` ve `update-every-10th`, tam liste yeniden-ekleme davranışı yerine minimal
DOM taşıma/patch yapmalı — Faz 2 (Set/Map fark + LIS) sonrası bu senaryolar create
süresinin küçük bir kesri olmalıdır. Karşılaştırma için sonuçları not edin.
